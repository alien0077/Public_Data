"""Run independent domains, retain successful outputs, and report failures."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from twstock_public import collectors  # noqa: E402


def completed_day(now: datetime):
    local = now.astimezone(ZoneInfo("Asia/Taipei"))
    # Delayed schedules can start after midnight or before the next close.
    return (local - timedelta(days=int(local.hour < 18))).date()


def run(data_root: Path, now: datetime) -> dict[str, Any]:
    end = completed_day(now)
    calendar = data_root / "factory/reference/calendar.json"
    holidays = set(json.loads(calendar.read_text())["holidays"])
    outcomes = {}

    def attempt(key, action):
        try:
            path = action()
            outcomes[key] = {"status": "PASS", "path": str(path)}
        except Exception as exc:
            outcomes[key] = {"status": "FAIL", "error": str(exc)}

    for offset in range(6, -1, -1):
        day = end - timedelta(days=offset)
        if day.weekday() >= 5 or day.isoformat() in holidays:
            continue
        for domain in ("market", "institutional", "margin"):
            path = data_root / f"factory/raw/{domain}/{day}.json"
            key = f"{domain}/{day}"
            if path.exists():
                outcomes[key] = {"status": "EXISTING", "path": str(path)}
            else:
                collector = getattr(collectors, f"sync_{domain}")
                attempt(key, lambda fn=collector, d=day: fn(d, data_root))
    for domain in ("financial", "revenue", "fx"):
        collector = getattr(collectors, f"sync_{domain}")
        attempt(domain, lambda fn=collector: fn(data_root))
    failed = any(v["status"] == "FAIL" for v in outcomes.values())
    report = {
        "updated_at": now.isoformat(),
        "completed_market_day": str(end),
        "status": "FAIL" if failed else "PASS",
        "domains": outcomes,
    }
    collectors._write_json(data_root / "factory/health/daily.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    args = parser.parse_args()
    report = run(args.data_root, datetime.now(ZoneInfo("Asia/Taipei")))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(int(report["status"] != "PASS"))
