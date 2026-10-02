import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch
from zoneinfo import ZoneInfo

import pytest
import requests

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "src"))
from twstock_public import collectors  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "run_daily_factory", ROOT / "scripts/run_daily_factory.py"
)
factory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(factory)


def test_truncated_body_is_retried():
    good = Mock(status_code=200, content=b"complete")
    with patch.object(collectors.requests, "get", side_effect=[
        requests.exceptions.ChunkedEncodingError("truncated"), good
    ]) as get, patch.object(collectors.time, "sleep"):
        assert collectors._request("https://example.test") is good
        assert get.call_count == 2


def test_permanent_http_error_is_not_retried():
    bad = Mock(status_code=404)
    bad.raise_for_status.side_effect = requests.HTTPError("404")
    with patch.object(collectors.requests, "get", return_value=bad) as get:
        with pytest.raises(requests.HTTPError):
            collectors._request("https://example.test")
        assert get.call_count == 1


def test_retries_are_bounded():
    with patch.object(collectors.requests, "get", side_effect=requests.Timeout) as get:
        with patch.object(collectors.time, "sleep"):
            with pytest.raises(requests.Timeout):
                collectors._request("https://example.test")
        assert get.call_count == 4


def test_market_uses_tpex_date_contract_and_rejects_empty(tmp_path):
    twse = Mock()
    twse.json.return_value = {"stat": "OK", "tables": [{}]}
    tpex = Mock(content="代號,名稱\n2330,台積電".encode("big5"))
    with patch.object(collectors, "_request", side_effect=[twse, tpex]) as request:
        path = collectors.sync_market(datetime(2026, 10, 1).date(), tmp_path)
        assert path.exists()
        assert request.call_args.args[1]["date"] == "115/10/01"
        assert request.call_args.args[1]["response"] == "csv"
    twse.json.return_value = {"stat": "no data"}
    with patch.object(collectors, "_request", side_effect=[twse, tpex]):
        with pytest.raises(ValueError):
            collectors.sync_market(datetime(2026, 10, 2).date(), tmp_path)
    assert not (tmp_path / "factory/raw/market/2026-10-02.json").exists()


def test_delayed_schedule_uses_previous_completed_day():
    now = datetime(2026, 10, 2, 2, 30, tzinfo=ZoneInfo("Asia/Taipei"))
    assert str(factory.completed_day(now)) == "2026-10-01"


def test_domain_failure_does_not_block_other_outputs(tmp_path):
    calendar = tmp_path / "factory/reference/calendar.json"
    calendar.parent.mkdir(parents=True)
    calendar.write_text(json.dumps({"holidays": ["2026-09-25", "2026-09-28"]}))
    now = datetime(2026, 10, 2, 2, 30, tzinfo=ZoneInfo("Asia/Taipei"))
    calls = []

    def okay(day, root):
        calls.append(str(day))
        return root / "output.json"

    with patch.object(collectors, "sync_market", side_effect=RuntimeError("offline")):
        with patch.object(collectors, "sync_institutional", side_effect=okay):
            with patch.object(collectors, "sync_margin", side_effect=okay):
                with patch.object(collectors, "sync_financial", return_value=tmp_path), \
                     patch.object(collectors, "sync_revenue", return_value=tmp_path), \
                     patch.object(collectors, "sync_fx", return_value=tmp_path):
                    report = factory.run(tmp_path, now)
    assert report["status"] == "FAIL"
    assert report["domains"]["fx"]["status"] == "PASS"
    assert "2026-09-28" not in calls
    assert "2026-10-02" not in calls
    assert "2026-10-01" in calls
    assert json.loads((tmp_path / "factory/health/daily.json").read_text()) == report
