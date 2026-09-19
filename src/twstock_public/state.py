from __future__ import annotations
import json, os
from pathlib import Path
from tempfile import NamedTemporaryFile
DOMAINS=("market","institutional","margin","financial","revenue","tdcc","etf","fx")
def load_state(path: Path)->dict:
    if not path.exists():
        return {d:{"last_success":None,"last_attempt":None,"status":"never"} for d in DOMAINS}
    return json.loads(path.read_text(encoding="utf-8"))
def save_state(path: Path,state: dict)->None:
    path.parent.mkdir(parents=True,exist_ok=True)
    with NamedTemporaryFile("w",encoding="utf-8",dir=path.parent,delete=False) as h:
        json.dump(state,h,ensure_ascii=False,indent=2,sort_keys=True); h.write("\n"); tmp=h.name
    os.replace(tmp,path)
