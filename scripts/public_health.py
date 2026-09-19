#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,sys
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/"src"))
from twstock_public.health import build_health
from twstock_public.state import load_state
p=argparse.ArgumentParser();p.add_argument("--data-root",type=Path,default=Path("data"));p.add_argument("--state",type=Path,default=Path("state/pipeline_state.json"));p.add_argument("--output",type=Path,default=Path("data/data_health.json"));a=p.parse_args()
state=load_state(a.state);latest=max((v.get("last_success") for v in state.values() if v.get("last_success")),default=date.today().isoformat())
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(build_health(state,date.fromisoformat(latest),a.data_root),ensure_ascii=False,indent=2)+"\n")
