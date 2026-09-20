import pandas as pd
import requests
import io
import re
import os
import time
import urllib3
import numpy as np
import json
import math
from datetime import datetime, timedelta, timezone
from github_utils import GitHubDataExporter
from collections import OrderedDict

# 🚀 v2.5.0: 季報同步引擎 (環境自適應 + 穩定對位版)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
exporter = GitHubDataExporter()

def get_now_tpe():
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8)))

def pf(v):
    if v is None or pd.isna(v): return 0.0
    s = str(v).replace(',', '').strip()
    if s == "" or s == "--" or s.lower() == "nan": return 0.0
    if '(' in s and ')' in s:
        inner = re.sub(r'[^\d.]', '', s)
        return -float(inner) if inner else 0.0
    try: return float(re.sub(r'[^\d.-]', '', s))
    except: return 0.0

def get_strict_headers(referer):
    return OrderedDict([
        ("Host", "mopsov.twse.com.tw"), ("Connection", "keep-alive"),
        ("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"),
        ("Accept", "*/*"), ("Referer", referer), ("Content-Type", "application/x-www-form-urlencoded")
    ])

def fetch_all_mops_csvs(session, ajax_url, payload, referer, q_str):
    p = payload.copy()
    all_filenames = []
    for q_val in ["Y", ""]:
        p["isQuery"] = q_val
        try:
            resp = session.post(ajax_url, data=p, headers=get_strict_headers(referer), verify=False, timeout=30)
            all_filenames.extend(re.findall(r"name=['\"]filename['\"] value=['\"](.*?\.csv)['\"]", resp.text))
        except: pass
    
    filenames = sorted(list(set(all_filenames)))
    if not filenames: return None
    
    # 🚀 v2.4: 依季度分目錄存檔 (對齊環境路徑)
    raw_dir = os.path.join(exporter.base_path, "raw_csvs/quarterly", q_str.replace("-", ""))
    os.makedirs(raw_dir, exist_ok=True)
    
    all_dfs = []
    for fn in filenames:
        try:
            dl_resp = session.post("https://mopsov.twse.com.tw/server-java/t105sb02", data={"step":"10","firstin":"true","filename":fn}, headers=get_strict_headers(referer), verify=False, timeout=30)
            dl_resp.encoding = 'cp950'
            with open(os.path.join(raw_dir, fn), 'w', encoding='cp950') as f: f.write(dl_resp.text)
            df = pd.read_csv(io.StringIO(dl_resp.text), thousands=',', skiprows=0, on_bad_lines='skip', engine='python')
            if not df.empty: all_dfs.append(df)
        except: pass
    return pd.concat(all_dfs, ignore_index=True) if all_dfs else None

def cln(df, mapping):
    if df is None or df.empty: return pd.DataFrame()
    def clean_col(c): return re.sub(r'[\s\(\)（）]', '', str(c))
    sid_col = next((c for c in df.columns if "公司代號" in str(c)), None)
    if not sid_col: return pd.DataFrame()
    df["sid"] = df[sid_col].astype(str).str.strip()
    df = df[df["sid"].str.isdigit()].copy()
    res = pd.DataFrame(); res["sid"] = df["sid"]
    cleaned_cols = {clean_col(c): c for c in df.columns}
    for k, cands in mapping.items():
        if k == "sid": continue
        matched_orig_col = None
        for cand in cands:
            clean_cand = clean_col(cand)
            if clean_cand in cleaned_cols:
                matched_orig_col = cleaned_cols[clean_cand]; break
        if matched_orig_col: res[k] = df[matched_orig_col].apply(pf)
        else: res[k] = 0.0
    return res.groupby("sid").max().reset_index()

def main():
    print(f"📡 啟動季報同步引擎 (v2.5.0 - 環境自適應)...")
    now_tpe = get_now_tpe()
    is_map = {
        "rev": ["營業收入", "利息淨收益", "收益合計"],
        "gp": ["營業毛利毛損淨額", "營業毛利毛損", "營業毛利", "營業利益合計"],
        "op": ["營業利益損失", "營業利益"],
        "ni": ["淨利淨損歸屬於母公司業主", "歸屬於母公司業主之淨利損", "本期淨利淨損", "本期淨利"],
        "eps": ["基本每股盈餘元", "基本每股盈餘"]
    }
    bs_map = {
        "assets": ["資產總計", "資產總額", "資產合計"],
        "equity": ["歸屬於母公司業主之權益合計", "權益總計", "權益總額"],
        "bvps": ["每股參考淨值", "每股淨值"]
    }
    expected_companies = 1800
    try:
        meta_path = os.path.join(exporter.base_path, "meta", "stocks.json")
        payload = json.load(open(meta_path, encoding="utf-8"))
        rows = payload.get("stocks", payload.get("data", []))
        company_rows = [row for row in rows if str(row.get("symbol", "")).isdigit() and len(str(row.get("symbol", ""))) == 4 and str(row.get("official_sector", "")).upper() != "ETF"]
        expected_companies = max(1, len(company_rows))
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    min_coverage = float(os.getenv("QUARTERLY_MIN_COVERAGE", "0.85"))
    minimum_rows = max(1, math.ceil(expected_companies * min_coverage))
    quarters = []
    start_year = int(os.getenv("QUARTERLY_START_YEAR", "2021"))
    end_year = int(os.getenv("QUARTERLY_END_YEAR", str(now_tpe.year)))
    for calendar_year in range(start_year, end_year + 1):
        yr = calendar_year - 1911
        for q in [1, 2, 3, 4]: quarters.append((yr, q))

    # Daily sync may make the latest MOPS quarter available before the normal
    # quarterly workflow date.  Probe only the currently expected quarter in
    # that mode; do not redownload the whole historical range every day.
    if os.getenv("QUARTERLY_LATEST_ONLY") == "1":
        if now_tpe.month <= 4:
            expected_year, expected_quarter = now_tpe.year - 1, 4
        elif now_tpe.month <= 7:
            expected_year, expected_quarter = now_tpe.year, 1
        elif now_tpe.month <= 10:
            expected_year, expected_quarter = now_tpe.year, 2
        else:
            expected_year, expected_quarter = now_tpe.year, 3
        quarters = [(expected_year - 1911, expected_quarter)]
            
    latest_q = None
    latest_only = os.getenv("QUARTERLY_LATEST_ONLY") == "1"
    for yr, q in quarters:
        q_str = f"{yr+1911}-Q{q}"
        # Latest-only mode is a freshness probe: an existing aggregate may
        # predate a late filing, amendment, or newly completed market batch.
        # Historical backfills remain incremental and skip completed files.
        if not latest_only and exporter.check_remote_exists("quarterly", q_str):
            latest_q = q_str; continue
        
        date_key = f"{yr + 1911}-{str(q*3).zfill(2)}-{['31','30','30','31'][q-1]}"
        if datetime.strptime(date_key, "%Y-%m-%d") > now_tpe.replace(tzinfo=None): continue
        
        print(f"  📥 正在抓取 {q_str}...", end=" ", flush=True)
        retry = int(os.getenv("QUARTERLY_RETRIES", "5")); success = False
        while retry > 0:
            # MOPS 會把同一個 runner 的 cookie／暫時節流狀態延續到下一次請求；
            # 每輪建立新 Session，才是真正可重試的完整查詢。
            session = requests.Session()
            try:
                session.get("https://mopsov.twse.com.tw/mops/web/index", verify=False, timeout=10)
            except requests.RequestException as exc:
                print(f"⚠️ MOPS 首頁初始化失敗: {exc}", end=" ", flush=True)
            all_merged = []
            for mkt in ["sii", "otc"]:
                p = {"encodeURIComponent":"1","step":"1","firstin":"1","off":"1","TYPEK":mkt,"year":str(yr),"season":str(q).zfill(2)}
                is_df = fetch_all_mops_csvs(session, "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04", p, "https://mopsov.twse.com.tw/mops/web/t163sb04", q_str)
                time.sleep(3)
                bs_df = fetch_all_mops_csvs(session, "https://mopsov.twse.com.tw/mops/web/ajax_t163sb05", p, "https://mopsov.twse.com.tw/mops/web/t163sb05", q_str)
                if is_df is not None and bs_df is not None:
                    m = pd.merge(cln(is_df, is_map), cln(bs_df, bs_map), on="sid")
                    if not m.empty:
                        print(f"[{mkt}: {len(m)} 檔]", end=" ", flush=True)
                        all_merged.append(m)
                else:
                    print(f"[{mkt}: 下載不完整]", end=" ", flush=True)
            
            if all_merged:
                final_df = pd.concat(all_merged, ignore_index=True).drop_duplicates(subset=["sid"])
                if len(final_df) >= minimum_rows:
                    results = []
                    for _, r in final_df.iterrows():
                        rev, gp, op, ni, eps = r['rev'], r['gp'], r['op'], r['ni'], r['eps']
                        assets, equity, bvps = r['assets'], r['equity'], r['bvps']
                        results.append({
                            "id": r['sid'], "eps": round(eps, 2),
                            "gm": round(gp/rev*100, 2) if rev>0 else 0,
                            "om": round(op/rev*100, 2) if rev>0 else 0,
                            "nm": round(ni/rev*100, 2) if rev>0 else 0,
                            "roe": round(ni/equity*100, 2) if equity>0 else 0,
                            "roa": round(ni/assets*100, 2) if assets > 0 else 0,
                            "bvps": round(bvps, 2)
                        })
                    exporter.export_to_json(pd.DataFrame(results), "quarterly", q_str, meta={"fiscal_period": q_str, "expected_companies": expected_companies, "coverage": round(len(results) / expected_companies, 6), "minimum_coverage": min_coverage})
                    latest_q = q_str; success = True; print(f"✅ 完成 {len(results)} 檔"); break
                else: print(f"⚠️ 筆數不足 ({len(final_df)}/{minimum_rows}; expected={expected_companies}, coverage={len(final_df) / expected_companies:.1%})...", end=" ", flush=True)
            else: print("❌ 失敗...", end=" ", flush=True)
            retry -= 1; time.sleep(15)
        if not success: print(f"⏭️ {q_str} 跳過。")
            
    if latest_q: exporter.update_index("latest_quarterly", latest_q)
    print("\n🏁 結束。")

if __name__ == "__main__":
    main()
