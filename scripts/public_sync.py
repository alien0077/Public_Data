#!/usr/bin/env python3
from __future__ import annotations
import argparse, sys
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from twstock_public import collectors
p=argparse.ArgumentParser()
p.add_argument("domain",choices=("market","institutional","margin","calendar","tdcc","financial","revenue","etf","fx","corporate_actions"))
p.add_argument("--date",type=date.fromisoformat,default=date.today())
p.add_argument("--data-root",type=Path,default=Path("data"))
a=p.parse_args()
dispatch={
"market":lambda:collectors.sync_market(a.date,a.data_root),
"institutional":lambda:collectors.sync_institutional(a.date,a.data_root),
"margin":lambda:collectors.sync_margin(a.date,a.data_root),
"calendar":lambda:collectors.sync_calendar(a.data_root),
"tdcc":lambda:collectors.sync_tdcc(a.data_root),
"financial":lambda:collectors.sync_financial(a.data_root),
"revenue":lambda:collectors.sync_revenue(a.data_root),
"etf":lambda:collectors.sync_etf(a.data_root),
"fx":lambda:collectors.sync_fx(a.data_root),
"corporate_actions":lambda:collectors.sync_corporate_actions(a.data_root),
}
print(dispatch[a.domain]())
