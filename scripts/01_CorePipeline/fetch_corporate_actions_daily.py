import sys
import os
# 🚀 修正路徑以匯入 github_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import requests
import io
import re
import time
import urllib3
from datetime import datetime, timedelta
from github_utils import GitHubDataExporter

# 🚀 v2.0.1: 企業行為每日監控引擎 (JSON 規格對齊版)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

exporter = GitHubDataExporter()
session = requests.Session()
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def clean_sid(s):
    return str(s).strip().replace('"', '')

def parse_date(d):
    s = str(d).replace('年', '-').replace('月', '-').replace('日', '').replace('/', '-')
    parts = s.split('-')
    if len(parts) == 3:
        y = int(parts[0]) + 1911 if int(parts[0]) < 1900 else int(parts[0])
        return f"{y}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
    return d

def pick_field(row, names):
    for name in names:
        if name in row.index and pd.notna(row.get(name)):
            return row.get(name)
    raise KeyError(f"none of fields present: {names}; got={list(row.index)}")

def pf(v):
    if v is None or pd.isna(v): return 0.0
    s = str(v).replace(',', '').strip()
    try: return float(s) if s else 0.0
    except: return 0.0

def sync_corporate_actions():
    print(f"📡 啟動企業行為每日監控引擎 (v2.0.1)...")
    
    now = datetime.now()
    start_dt = now - timedelta(days=7)
    end_dt = now + timedelta(days=90)
    
    start_twse = start_dt.strftime('%Y%m%d')
    start_tpex = start_dt.strftime('%Y/%m/%d')
    end_twse = end_dt.strftime('%Y%m%d')
    end_tpex = end_dt.strftime('%Y/%m/%d')

    all_actions = []
    source_failures = []

    # --- 1. TWSE ---
    print(f"  📥 正在掃描 TWSE...", end=" ", flush=True)
    try:
        # 除權息
        res = session.get(f"https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate={start_twse}&endDate={end_twse}&response=json", headers=HEADERS, timeout=15)
        if res.status_code == 200 and res.json().get('stat') == 'OK':
            df = pd.DataFrame(res.json()['data'], columns=res.json()['fields'])
            for _, r in df.iterrows():
                all_actions.append({
                    "stock_id": clean_sid(pick_field(r, ["股票代號", "代號"])), "ex_date": parse_date(pick_field(r, ["資料日期", "除權息日期", "日期"])), "type": "DIVIDEND",
                    "cash_dividend": pf(r.get('現金股利')), "stock_dividend": pf(r.get('無償配股率')) * 10.0,
                    "capital_reduction": 0.0, "split_ratio": 1.0
                })
        # 減資
        res = session.get(f"https://www.twse.com.tw/rwd/zh/reducation/TWTAUU?startDate={start_twse}&endDate={end_twse}&response=json", headers=HEADERS, timeout=15)
        if res.status_code == 200 and res.json().get('stat') == 'OK':
            df = pd.DataFrame(res.json()['data'], columns=res.json()['fields'])
            for _, r in df.iterrows():
                all_actions.append({
                    "stock_id": clean_sid(pick_field(r, ["股票代號", "代號"])), "ex_date": parse_date(pick_field(r, ["資料日期", "恢復買賣日期", "減資恢復買賣日期", "日期"])), "type": "REDUCTION",
                    "cash_dividend": 0.0, "stock_dividend": 0.0, "capital_reduction": 1.0, "split_ratio": 1.0
                })
        print("✅")
    except Exception as e:
        source_failures.append(f"TWSE: {e}")
        print(f"❌ (TWSE Err: {str(e)[:80]})")

    # --- 2. TPEX ---
    print(f"  📥 正在掃描 TPEX...", end=" ", flush=True)
    try:
        res = session.post("https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ", data={"startDate": start_tpex, "endDate": end_tpex, "response": "json"}, headers=HEADERS, timeout=15)
        if res.status_code == 200:
            tables = res.json().get('tables', [])
            if tables:
                data = tables[0].get('data', [])
                fields = tables[0].get('fields', [])
                df = pd.DataFrame(data, columns=fields)
                for _, r in df.iterrows():
                    all_actions.append({
                        "stock_id": clean_sid(r.get('代號', r.get('股票代號'))), "ex_date": parse_date(r.get('除權息日期', r.get('資料日期'))), "type": "DIVIDEND",
                        "cash_dividend": pf(r.get('現金股利')), "stock_dividend": (pf(r.get('盈餘配股率')) + pf(r.get('公積配股率'))) * 10.0,
                        "reduction": 0.0, "split_ratio": 1.0
                    })
        print("✅")
    except Exception as e:
        source_failures.append(f"TPEX: {e}")
        print(f"❌ (TPEX Err: {str(e)[:80]})")

    if source_failures:
        raise RuntimeError("corporate actions partial source failure: " + " | ".join(source_failures))

    if not all_actions:
        today_str = now.strftime("%Y-%m-%d")
        exporter.update_index("latest_action", today_str)
        print("💡 本次掃描無新資料。")
        print(f"🏁 監控完成。最新標記: {today_str}")
        return

    # --- 3. 處理與儲存 ---
    df_final = pd.DataFrame(all_actions)
    df_final['year'] = df_final['ex_date'].apply(lambda x: x.split('-')[0])
    
    for yr, group in df_final.groupby('year'):
        filename = f"{yr}"
        existing_data = []
        
        local_path = os.path.join(exporter.base_path, "meta/actions", f"{filename}.json")
        if os.path.exists(local_path):
            try:
                import json
                with open(local_path, 'r', encoding='utf-8') as f:
                    old_json = json.load(f)
                    existing_data = old_json.get('data', [])
                    if not existing_data: existing_data = old_json.get('stocks', [])
            except: pass
            
        new_records = group.to_dict(orient='records')
        # 🎯 合併邏輯：以 stock_id + ex_date + type 為 Key
        combined = { (r['stock_id'], r['ex_date'], r.get('type', 'DIVIDEND')): r for r in (existing_data + new_records) }
        final_list = sorted(combined.values(), key=lambda x: (x['ex_date'], x['stock_id']), reverse=True)
        
        exporter.export_to_json(pd.DataFrame(final_list), "meta/actions", filename)
    
    today_str = now.strftime("%Y-%m-%d")
    exporter.update_index("latest_action", today_str)
    print(f"\n🏁 監控完成。最新標記: {today_str}")

if __name__ == "__main__":
    sync_corporate_actions()
