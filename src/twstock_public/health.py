from __future__ import annotations
from datetime import date, datetime, timezone
from pathlib import Path
def build_health(state: dict, expected_date: date, data_root: Path|None=None)->dict:
    result={"generated_at":datetime.now(timezone.utc).isoformat(),"domains":{}}
    for domain,details in state.items():
        latest=details.get("last_success")
        exists=None
        if data_root is not None:
            exists=bool(list(data_root.glob(f"**/{latest}.json"))) if latest else False
        result["domains"][domain]={"latest_date":latest,"expected_date":expected_date.isoformat(),"stale":latest!=expected_date.isoformat() if latest else True,"status":details.get("status","unknown") if exists is not False else "missing_output","output_exists":exists}
    return result
