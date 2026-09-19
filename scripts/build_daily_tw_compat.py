import pandas as pd
import requests
import io
import os
import time
import csv
import urllib3
import json
import numpy as np
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

class PublicDataExporter:
    def __init__(self):
        self.base_path = DATA_ROOT
    def check_remote_exists(self, folder, key):
        return os.path.exists(os.path.join(self.base_path, folder, f"{key}.json"))
    def export_to_json(self, df, folder, key):
        path=os.path.join(self.base_path,folder,f"{key}.json")
        os.makedirs(os.path.dirname(path),exist_ok=True)
        rows=df.to_dict("records")
        with open(path,"w",encoding="utf-8") as h:
            json.dump({"date":key,"stocks":rows,"data":rows},h,ensure_ascii=False)
    def update_index(self, key, value):
        path=os.path.join(self.base_path,"index.json")
        try:
            with open(path,encoding="utf-8") as h: payload=json.load(h)
        except Exception: payload={}
        payload[key]=value
        with open(path,"w",encoding="utf-8") as h: json.dump(payload,h,ensure_ascii=False,indent=2)

# 🚀 v1.33.1: 台股同步引擎 (支援還原價格與全指標導出)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
pd.set_option('future.no_silent_downcasting', True)
DATA_ROOT = os.getenv("PUBLIC_DATA_ROOT", "data")
ACTIONS_DIR = os.path.join(DATA_ROOT, "meta/actions")

def load_corporate_actions():
    actions = {}
    os.makedirs(ACTIONS_DIR, exist_ok=True)
    local_files = [f for f in os.listdir(ACTIONS_DIR) if f.endswith(".json")]
    if not local_files:
        current_year = get_now_tpe().year
        for y in range(2020, current_year + 1):
            url = f"https://alien0077.github.io/Public_Data/data/meta/actions/{y}.json"
            try:
                resp = requests.get(url, timeout=10)
                if resp.status_code == 200:
                    with open(os.path.join(ACTIONS_DIR, f"{y}.json"), 'w', encoding='utf-8') as f:
                        f.write(resp.text)
                    local_files.append(f"{y}.json")
            except: pass
    for f in local_files:
        try:
            with open(os.path.join(ACTIONS_DIR, f), 'r', encoding='utf-8') as file:
                data = json.load(file)
                for s in data.get('stocks', []):
                    sid = str(s['stock_id'])
                    if sid not in actions: actions[sid] = []
                    actions[sid].append(s)
        except: continue
    for sid in actions:
        actions[sid] = sorted(actions[sid], key=lambda x: x['ex_date'], reverse=True)
    return actions

def apply_adjustments_to_df(df, all_actions):
    # 確保 adj_c 初始值為原始收盤價。企業行為的調整因子對除權息日
    # 之前的所有觀測都適用；用差分陣列做區間累乘，避免每個 action
    # 重新掃描整個 DataFrame（歷史回補時可由數分鐘降至秒級）。
    df['adj_c'] = df['c'].astype(float)
    for sid, stock_actions in all_actions.items():
        mask = df['id'].to_numpy() == sid
        positions = np.flatnonzero(mask)
        if positions.size == 0:
            continue
        positions = positions[np.argsort(df.iloc[positions]['date'].to_numpy())]
        dates = df.iloc[positions]['date'].astype(str).to_numpy()
        closes = df.iloc[positions]['c'].astype(float).to_numpy()
        log_diff = np.zeros(len(positions) + 1, dtype=float)
        for action in stock_actions:
            ex_date = str(action.get('ex_date', ''))
            boundary = int(np.searchsorted(dates, ex_date, side='left'))
            if boundary <= 0:
                continue
            prev_close = closes[boundary - 1]
            if prev_close <= 0:
                continue
            a_type = action.get('type')
            factor = 1.0
            if a_type == "SPLIT":
                ratio = float(action.get('split_ratio', 1.0) or 0)
                if ratio > 0:
                    factor = 1.0 / ratio
            elif a_type == "STOCK_DIVIDEND_RIGHT":
                right_value = float(action.get('stock_dividend', 0) or 0) / 10.0
                if right_value > 0:
                    factor = (prev_close - right_value) / prev_close
            elif a_type == "DIVIDEND":
                cash = float(action.get('cash_dividend', 0) or 0)
                stock = float(action.get('stock_dividend', 0) or 0)
                factor = (prev_close - cash) / (1.0 + stock / 10.0) / prev_close
            elif a_type == "CASH_CAPITAL_INCREASE":
                cash = float(action.get('cash_dividend', 0) or 0)
                stock_div = float(action.get('stock_dividend', 0) or 0)
                if stock_div > 0:
                    ref_price = (prev_close - cash * (stock_div / 10.0)) / (1.0 + stock_div / 10.0)
                    factor = ref_price / prev_close
            elif a_type == "REDUCTION":
                cash = float(action.get('cash_dividend', 0) or 0)
                ratio = float(action.get('ratio', 1.0) or 0)
                if ratio > 0:
                    factor = (prev_close - cash) / ratio / prev_close
            if factor > 0 and np.isfinite(factor):
                log_factor = np.log(factor)
                log_diff[0] += log_factor
                log_diff[boundary] -= log_factor
        adjusted = closes * np.exp(np.cumsum(log_diff[:-1]))
        # concat 後 legacy cache 可能保留重複 index；這裡以原始 row
        # position 寫回，避免 loc 將同一 label 展開成不等長 assignment。
        df.iloc[positions, df.columns.get_loc('adj_c')] = adjusted
    
    return df

session = requests.Session()
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    'Referer': 'https://www.twse.com.tw/',
}
session.headers.update(HEADERS)

# 上市價量、法人與資券是同一份日檔的必要來源；僅有價量時不可把其他欄位
# 靜默寫成 0，否則後續法人、融資券與量化計算會把「抓取失敗」誤判成「無交易」。
TWSE_MIN_ROWS = {
    'price': 1000,
    'institutional': 800,
    'margin': 800,
}

def get_now_tpe():
    return datetime.now(ZoneInfo("Asia/Taipei"))

def compute_rsi(series, periods=14):
    if len(series) < 2: return pd.Series([50.0] * len(series))
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=periods, min_periods=1).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=periods, min_periods=1).mean()
    rs = gain / loss.replace(0, np.nan)
    res = 100 - (100 / (1 + rs))
    return res.fillna(100.0 if loss.sum() == 0 else 50.0)

def compute_indicators(df_history, all_actions=None):
    """ 為每個 stock_id 計算技術指標與量化評分 """
    if df_history.empty: return df_history
    df = df_history.sort_values(['id', 'date'])
    
    # 🚀 v1.33.0: 套用還原價格 (Adjusted Prices)
    if all_actions:
        df = apply_adjustments_to_df(df, all_actions)
    else:
        df['adj_c'] = df['c']

    # 1. 基礎指標 (使用還原價格 adj_c)
    # 🚀 v1.33.1: 修正 min_periods，防止新上市股票因數據不足而產生虛假均線
    df['pct'] = df.groupby('id')['adj_c'].transform(lambda x: x.pct_change(fill_method=None) * 100).replace([np.inf, -np.inf], 0).round(2)
    for window in [5, 10, 20, 60, 120, 240]:
        df[f'ma{window}'] = df.groupby('id')['adj_c'].transform(lambda x: x.rolling(window, min_periods=window//2).mean()).round(2)
    
    df['vma20'] = df.groupby('id')['v'].transform(lambda x: x.rolling(20, min_periods=1).mean()).round(0)
    df['rsi'] = df.groupby('id')['adj_c'].transform(lambda x: compute_rsi(x, 14)).round(2)
    
    # 2. 🚀 量化評分
    df['ts'] = 0.0
    df.loc[df['adj_c'] > df['ma5'], 'ts'] += 30
    df.loc[df['adj_c'] > df['ma20'], 'ts'] += 40
    df.loc[df['adj_c'] > df['ma60'], 'ts'] += 30
    
    if 'f' in df.columns and 'it' in df.columns:
        df['cs'] = 50.0
        df.loc[df['f'] > 0, 'cs'] += 25
        df.loc[df['it'] > 0, 'cs'] += 25
    else: df['cs'] = 50.0
    df['ss'] = 50.0
    
    # 3. 🚀 RS (相對強度)
    df['rs'] = df.groupby('id')['adj_c'].transform(
        lambda x: (x.pct_change(63).fillna(0)*0.5 + x.pct_change(126).fillna(0)*0.3 + x.pct_change(250).fillna(0)*0.2)*100
    ).replace([np.inf, -np.inf], 0).round(2)
    
    return df

def fetch_full_market_data(date_str_hyphen):
    d_str = date_str_hyphen.replace('-', '')
    price_recs = []; inst_map = {}; tw_count = 0; tp_count = 0
    _t0 = time.time()
    
    # 抓取上市
    print(f"\n    ⏳ [{date_str_hyphen}] TWSE 上市價量...", end=" ", flush=True)
    _st = time.time()
    tw_p, _ = fetch_twse_json("https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX", {'date': d_str, 'type': 'ALLBUT0999', 'response': 'json'}, "上市價量")
    print(f"{len(tw_p)} 筆 ({time.time()-_st:.1f}s)", flush=True)
    for r in tw_p:
        try:
            sid = r[0].strip()
            if len(sid)==4 or (sid.startswith("00") and (5<=len(sid)<=6)):
                def cf(s): 
                    try: return float(str(s).replace(',',''))
                    except: return 0.0
                
                c_val = cf(r[8]); o_val = cf(r[5])
                h_val = cf(r[6]); l_val = cf(r[7])
                if h_val <= 0: h_val = c_val
                if l_val <= 0: l_val = c_val
                if o_val <= 0: o_val = c_val

                price_recs.append({"id": sid, "date": date_str_hyphen, "o": o_val, "h": h_val, "l": l_val, "c": c_val, "v": cf(r[2]), "t": cf(r[4])})
                tw_count += 1
        except: pass
        
    # 抓取上櫃
    print(f"    ⏳ [{date_str_hyphen}] TPEX 上櫃價量...", end=" ", flush=True)
    _st = time.time()
    tp_csv = fetch_tpex_csv("https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes/download", d_str)
    print(f"(CSV {time.time()-_st:.1f}s)", flush=True)
    data_started = False
    for r in tp_csv:
        r = [col.strip().replace('"', '') for col in r]
        if not r or r[0] == "管理股票": break
        if r[0] == "代號": data_started = True; continue
        if data_started:
            try:
                sid = r[0]
                if len(sid)==4 or (sid.startswith("00") and (5<=len(sid)<=6)):
                    def cf(s):
                        try: return float(str(s).replace(',',''))
                        except: return 0.0
                    
                    c_val = cf(r[2]); o_val = cf(r[4])
                    h_val = cf(r[5]); l_val = cf(r[6])
                    if h_val <= 0: h_val = c_val
                    if l_val <= 0: l_val = c_val
                    if o_val <= 0: o_val = c_val

                    price_recs.append({"id": sid, "date": date_str_hyphen, "o": o_val, "h": h_val, "l": l_val, "c": c_val, "v": cf(r[7]), "t": cf(r[8])})
                    tp_count += 1
            except: pass

    # 兩階段歷史 backfill 的第一階段只需要價量原料；法人／資券會在
    # 正常增量 job 維持完整抓取，歷史模式則明確留下 deferred 狀態，
    # 避免為不必要的輔助端點增加 TWSE 安全限制與重試量。
    if os.getenv('TW_DAILY_DEFER_INDICATORS') == '1':
        df_p = pd.DataFrame(price_recs)
        df_p.attrs['source_health'] = {
            'twse_price_rows': len(tw_p),
            'tpex_price_rows': tp_count,
            'twse_institutional_rows': 0,
            'twse_margin_rows': 0,
            'auxiliary_data_status': 'deferred',
        }
        return df_p
        
    # 抓取法人 (上市)
    print(f"    ⏳ [{date_str_hyphen}] TWSE 三大法人...", end=" ", flush=True)
    _st = time.time()
    twi_rows, _ = fetch_twse_json("https://www.twse.com.tw/rwd/zh/fund/T86", {'date': d_str, 'selectType': 'ALLBUT0999', 'response': 'json'}, "上市三大法人")
    for r in twi_rows:
        try:
            sid = r[0].strip()
            if sid not in inst_map: inst_map[sid] = {}
            inst_map[sid].update({"f": float(r[4].replace(',',''))/1000, "it": float(r[10].replace(',',''))/1000, "d": float(r[11].replace(',',''))/1000})
        except: pass
    print(f"{len(twi_rows)} 筆 ({time.time()-_st:.1f}s)", flush=True)

    # 抓取資券 (上市)
    print(f"    ⏳ [{date_str_hyphen}] TWSE 資券...", end=" ", flush=True)
    _st = time.time()
    twm_rows, _ = fetch_twse_json("https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN", {'date': d_str, 'selectType': 'ALL', 'response': 'json'}, "上市資券")
    for r in twm_rows:
        try:
            sid = r[0].strip()
            if sid not in inst_map: inst_map[sid] = {}
            def cf(s): return float(str(s).replace(',',''))
            mb = cf(r[6]); ms = cf(r[12])
            mbl = (ms / mb * 100) if mb > 0 else 0
            inst_map[sid].update({"mb": mb, "ms": ms, "mbl": round(mbl, 2)})
        except: pass
    print(f"{len(twm_rows)} 筆 ({time.time()-_st:.1f}s)", flush=True)

    # 抓取法人 (上櫃)
    print(f"    ⏳ [{date_str_hyphen}] TPEX 三大法人...", end=" ", flush=True)
    _st = time.time()
    try:
        url = "https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade"
        date_ad = date_str_hyphen.replace('-', '/')
        resp = session.get(url, params={'type': 'Daily', 'sect': 'AL', 'date': date_ad, 'response': 'json'}, timeout=15, verify=False)
        if resp.status_code == 200:
            j = resp.json()
            table_data = j.get('tables', [{}])[0].get('data', [])
            for r in table_data:
                sid = r[0].strip()
                if sid not in inst_map: inst_map[sid] = {}
                def cf(s): return float(str(s).replace(',',''))
                inst_map[sid].update({"f": cf(r[10])/1000, "it": cf(r[13])/1000, "d": cf(r[16])/1000})
    except: pass

    print(f"({time.time()-_st:.1f}s)", flush=True)

    # 抓取資券 (上櫃)
    print(f"    ⏳ [{date_str_hyphen}] TPEX 資券...", end=" ", flush=True)
    _st = time.time()
    try:
        url = "https://www.tpex.org.tw/www/zh-tw/margin/balance"
        date_ad = date_str_hyphen.replace('-', '/')
        payload = {'date': date_ad, 'id': '', 'response': 'json'}
        resp = session.post(url, data=payload, timeout=15, verify=False)
        if resp.status_code == 200:
            j = resp.json()
            table_data = j.get('tables', [{}])[0].get('data', [])
            for r in table_data:
                sid = r[0].strip()
                if sid not in inst_map: inst_map[sid] = {}
                def cf(s): return float(str(s).replace(',',''))
                mb = cf(r[6]); ms = cf(r[12])
                mbl = (ms / mb * 100) if mb > 0 else 0
                inst_map[sid].update({"mb": mb, "ms": ms, "mbl": round(mbl, 2)})
    except: pass
    print(f"({time.time()-_st:.1f}s)", flush=True)
        
    source_health = {
        'twse_price_rows': len(tw_p),
        'tpex_price_rows': tp_count,
        'twse_institutional_rows': len(twi_rows),
        'twse_margin_rows': len(twm_rows),
    }
    allow_partial_aux = os.getenv('TW_DAILY_ALLOW_PARTIAL_AUX') == '1'
    if tw_count > 0 or tp_count > 0:
        print(f"    ✅ [{date_str_hyphen}] API 全數完成 合併資料中... ({time.time()-_t0:.1f}s 總計)", flush=True)
        df_p = pd.DataFrame(price_recs)
        df_i = pd.DataFrame([{"id": k, **v} for k, v in inst_map.items()])
        required_cols = ["f", "it", "d", "mb", "ms", "mbl"]
        if df_i.empty:
            for col in required_cols: df_p[col] = None if allow_partial_aux else 0.0
            df_p.attrs['source_health'] = source_health
            return df_p
        else:
            df_final = pd.merge(df_p, df_i, on="id", how="left")
            for col in required_cols:
                if col not in df_final.columns: df_final[col] = None if allow_partial_aux else 0.0
            if allow_partial_aux:
                for col in required_cols:
                    df_final[col] = df_final[col].where(df_final[col].notna(), None)
            else:
                df_final = df_final.fillna(0)
            df_final.attrs['source_health'] = source_health
            return df_final
    return pd.DataFrame()

def fetch_twse_json(url, params, source_name, retries=5):
    """取得 TWSE JSON；空結果與 HTTP/JSON 異常都會退避重試並留在日誌。"""
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, params=params, timeout=20, verify=False)
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code}")
            payload = resp.json()
            if payload.get('stat') != 'OK':
                raise RuntimeError(f"TWSE stat={payload.get('stat')!r}")

            rows = []
            for table in payload.get('tables', []):
                candidate = table.get('data') or []
                if len(candidate) > len(rows):
                    rows = candidate
            if not rows:
                rows = payload.get('data9') or payload.get('data8') or payload.get('data') or []
            if rows:
                return rows, "OK"
            raise RuntimeError("API 回傳 0 筆資料")
        except (requests.RequestException, ValueError, RuntimeError) as exc:
            print(f"    ⚠️ {source_name} 第 {attempt}/{retries} 次失敗: {exc}", flush=True)
            if attempt < retries:
                time.sleep(attempt * 3)
    return [], "Fail"


def is_complete_daily_file(path):
    """舊日檔若關鍵上市欄位全為 0，視為曾抓取失敗並於下次排程回補。"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        # 歷史日檔曾使用 `stocks` 欄位；視為同一筆資料陣列，避免
        # legacy 檔案被誤判為損壞而從 2024 年重新回補。
        rows = payload.get('data') or payload.get('stocks') or payload if isinstance(payload, dict) else payload
        if not isinstance(rows, list) or len(rows) < 2000:
            return False
        nonzero = lambda key: sum(1 for row in rows if abs(float(row.get(key, 0) or 0)) > 0)
        # 融資／融券欄位由 daily_tw_margin_job.py 維護，日檔可能合法為 0；
        # 以價格與法人資料判斷是否為有效日檔，避免每次排程重抓正常檔案。
        return nonzero('c') >= 1000 and nonzero('f') >= 500
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return False

def fetch_tpex_csv(url, date_str):
    dt = datetime.strptime(date_str, '%Y%m%d')
    minguo = f"{dt.year - 1911}/{dt.month:02d}/{dt.day:02d}"
    params = {'date': minguo, 'id': '', 'response': 'csv'}
    try:
        resp = session.get(url, params=params, headers=HEADERS, timeout=15, verify=False)
        if resp.status_code == 200:
            content = resp.content.decode('cp950', errors='ignore').lstrip('\ufeff')
            return list(csv.reader(io.StringIO(content)))
    except: pass
    return []

def _parse_twse_holiday_rows(rows):
    """將 TWSE 假日 API 的西元／民國日期轉成 ISO 日期。"""
    import re

    holidays = set()
    for row in rows or []:
        if not row:
            continue
        raw_date = str(row[0]).strip()
        if not raw_date:
            continue
        if "-" in raw_date:
            candidate = raw_date[:10]
        else:
            match = re.search(r"(\d+)年(\d+)月(\d+)日", raw_date)
            if not match:
                continue
            candidate = f"{int(match.group(1)) + 1911:04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
        try:
            holidays.add(datetime.strptime(candidate, "%Y-%m-%d").strftime("%Y-%m-%d"))
        except ValueError:
            continue
    return holidays


def is_tw_non_trading_day(date_str, holidays):
    """只依週末與已確認的官方休市日判定；不以 API 空結果猜測假日。"""
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return dt.weekday() >= 5 or date_str in holidays


def load_calendar(exporter, start_year=None, end_year=None):
    local_path = os.path.join(DATA_ROOT, "meta", "calendar.json")
    calendar = None
    if os.path.exists(local_path):
        try:
            with open(local_path, 'r', encoding='utf-8') as f:
                calendar = json.load(f)
        except: pass
    if calendar is None:
        url = f"https://alien0077.github.io/Public_Data/data/meta/calendar.json?t={int(time.time())}"
        try:
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                calendar = resp.json()
        except: pass
    try:
        resp = requests.get(
            "https://www.twse.com.tw/holidaySchedule/holidaySchedule",
            params={"response": "json"},
            timeout=15,
            verify=False,
        )
        if resp.status_code == 200:
            calendar = resp.json()
    except Exception:
        calendar = None
    if calendar is None:
        return None

    # TWSE 的預設回應通常只有當年度。歷史回補不可把「日曆缺欄」
    # 當成開盤日，因此逐年要求官方年度假日表，補齊 PIT 回補範圍。
    years = calendar.setdefault("meta", {}).setdefault("years", {})
    if start_year is None or end_year is None:
        return calendar
    for year in range(start_year, end_year + 1):
        key = str(year)
        existing = years.get(key, {}).get("tw", [])
        if existing and all(str(day).startswith(f"{year}-") for day in existing):
            continue
        try:
            resp = requests.get(
                "https://www.twse.com.tw/holidaySchedule/holidaySchedule",
                # 新版 TWSE 頁面的年度欄位是 date；queryYear 會被忽略並
                # 回傳當年度，必須驗證日期年份後才可寫入日曆。
                params={"response": "json", "date": str(year)},
                timeout=15,
                verify=False,
            )
            if resp.status_code != 200:
                continue
            payload = resp.json()
            holiday_dates = sorted(_parse_twse_holiday_rows(payload.get("data", [])))
            year_dates = sorted(day for day in holiday_dates if day.startswith(f"{year}-"))
            if year_dates:
                years[key] = {"tw": year_dates}
                print(f"📅 已載入 TWSE {year} 年官方休市日 {len(year_dates)} 天。", flush=True)
            else:
                print(f"⚠️ TWSE 回傳內容不是 {year} 年，拒絕寫入該年度日曆。", flush=True)
        except Exception as exc:
            print(f"⚠️ TWSE {year} 年假日表載入失敗：{exc}；該年度僅跳過週末。", flush=True)
    # 日曆是後續增量與歷史回補共用的資料契約；持久化官方補齊結果，
    # 讓下一次 job 不必再次查詢，也讓 PIT audit 能追溯本次使用的日曆。
    try:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "w", encoding="utf-8") as handle:
            json.dump(calendar, handle, ensure_ascii=False, indent=2)
    except OSError as exc:
        print(f"⚠️ 無法更新本機 calendar.json：{exc}", flush=True)
    return calendar

def main():
    print("📡 啟動台股同步引擎 (V1.33.1 - 還原指標增強版)...")
    exporter = PublicDataExporter()
    now_tpe = get_now_tpe()
    start_dt = datetime.strptime(os.getenv("TW_DAILY_START_DATE", "2024-01-01"), "%Y-%m-%d")
    remote_cal = load_calendar(exporter, start_dt.year, now_tpe.year)
    tw_holidays = set()
    
    years_data = None
    if remote_cal:
        if "years" in remote_cal: years_data = remote_cal["years"]
        elif "meta" in remote_cal and "years" in remote_cal["meta"]: years_data = remote_cal["meta"]["years"]

    if years_data:
        for yr in years_data:
            holidays = years_data[yr].get("tw", [])
            tw_holidays.update(holidays)

    all_actions = load_corporate_actions()
    print(f"🧬 已載入 {len(all_actions)} 檔股票的企業行為資料。")

    today_str = now_tpe.strftime("%Y-%m-%d")
    all_dates = [(start_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range((now_tpe.replace(tzinfo=None) - start_dt).days + 1)]
    cache_path = os.path.join(DATA_ROOT, "meta", "fast_history_tw.csv.gz")
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)

    if not os.path.exists(cache_path):
        remote_cache_url = f"https://alien0077.github.io/Public_Data/data/meta/fast_history_tw.csv.gz"
        try:
            r = requests.get(remote_cache_url, timeout=15)
            if r.status_code == 200:
                with open(cache_path, 'wb') as f: f.write(r.content)
        except: pass

    df_history = pd.DataFrame(columns=['id', 'date', 'h', 'l', 'c', 'v'])
    if os.path.exists(cache_path):
        try:
            df_history = pd.read_csv(cache_path, compression='gzip')
        except: pass
            
    processed_count = 0; max_process = 1000; latest_success = None
    requested_dates = {
        value.strip() for value in os.getenv('TW_DAILY_DATES', '').split(',') if value.strip()
    }
    if requested_dates:
        print(f"🎯 僅回補指定日檔：{', '.join(sorted(requested_dates))}")
    minimum_rows = int(os.getenv("TW_DAILY_MIN_ROWS", "2000"))
    allow_partial_aux = os.getenv('TW_DAILY_ALLOW_PARTIAL_AUX') == '1'

    # 舊資料庫可能含有多個 legacy／歷史不完整檔案；只針對遠端最新日檔
    # 及其後日期做完整性檢查，避免每次排程從歷史檔案開始回補。
    existing_dates = []
    for name in os.listdir(os.path.join(DATA_ROOT, "daily/tw")):
        if name.endswith('.json') and len(name) >= 15:
            existing_dates.append(name[:10])
    latest_existing = max(existing_dates) if existing_dates else None
    
    for d_str in all_dates:
        if requested_dates and d_str not in requested_dates:
            continue
        if d_str > today_str: continue
        if d_str == today_str and now_tpe.hour < 18: continue
        
        dt = datetime.strptime(d_str, "%Y-%m-%d")
        is_holiday = is_tw_non_trading_day(d_str, tw_holidays)
        if d_str == today_str and False: is_holiday = True
        if is_holiday: continue
        # Historical replay must not let a newer fast-history cache row affect
        # indicators for this cutoff.  Keep the cache file intact; constrain
        # only the in-memory working set used for this date.
        if not df_history.empty and 'date' in df_history.columns:
            df_history = df_history[df_history['date'].astype(str) <= d_str].copy()
            
        if exporter.check_remote_exists("daily/tw", d_str):
            if latest_existing and d_str < latest_existing:
                latest_success = d_str
                continue
            # 檢查舊檔是否損壞或曾把上市來源失敗靜默寫成 0；後者也要回補。
            local_path = os.path.join(DATA_ROOT, "daily/tw", f"{d_str}.json")
            try:
                if is_complete_daily_file(local_path):
                    latest_success = d_str; continue
                print(f"\n⚠️ 偵測到不完整日檔，準備回補: {local_path}")
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                print(f"\n⚠️ 檢測到無法讀取的 JSON，準備重新生成: {local_path}")
            else:
                pass
            
        if processed_count >= max_process: break
        print(f"🔍 處理日期: {d_str}...", end=" ", flush=True)
        
        df_new = pd.DataFrame()
        for attempt in range(1, 6):
            print(f"    📡 Attempt {attempt}/5...", flush=True)
            df_new = fetch_full_market_data(d_str)
            if os.getenv('TW_DAILY_SKIP_EMPTY') == '1' and df_new.empty:
                print("    ℹ️ 官方來源無資料，記錄為歷史非交易日候選並繼續", flush=True)
                break
            health = df_new.attrs.get('source_health', {})
            sources_complete = (
                health.get('twse_price_rows', 0) >= TWSE_MIN_ROWS['price']
                and health.get('tpex_price_rows', 0) >= 500
                and health.get('twse_institutional_rows', 0) >= TWSE_MIN_ROWS['institutional']
                and health.get('twse_margin_rows', 0) >= TWSE_MIN_ROWS['margin']
            )
            price_complete = (
                health.get('twse_price_rows', 0) >= TWSE_MIN_ROWS['price']
                and health.get('tpex_price_rows', 0) >= 500
            )
            if allow_partial_aux and price_complete and len(df_new) >= minimum_rows:
                sources_complete = True
            if len(df_new) >= minimum_rows and sources_complete:
                print(f"    ✅ 取得 {len(df_new)} 筆資料，足夠處理", flush=True)
                break
            print(f"    ⚠️ 資料不完整 ({len(df_new)} 筆；來源={health})，10 秒後重試...", flush=True)
            time.sleep(10)
        
        health = df_new.attrs.get('source_health', {})
        if os.getenv('TW_DAILY_SKIP_EMPTY') == '1' and df_new.empty:
            empty_log = os.getenv('TW_DAILY_EMPTY_LOG', os.path.join(os.path.dirname(DATA_ROOT), '..', '.cache', 'fair-value-v2', 'daily-history', 'empty_dates.log'))
            os.makedirs(os.path.dirname(empty_log), exist_ok=True)
            with open(empty_log, 'a', encoding='utf-8') as handle:
                handle.write(f"{d_str}\n")
            continue
        sources_complete = (
            health.get('twse_price_rows', 0) >= TWSE_MIN_ROWS['price']
            and health.get('tpex_price_rows', 0) >= 500
            and health.get('twse_institutional_rows', 0) >= TWSE_MIN_ROWS['institutional']
            and health.get('twse_margin_rows', 0) >= TWSE_MIN_ROWS['margin']
        )
        if allow_partial_aux and len(df_new) >= minimum_rows and (
            health.get('twse_price_rows', 0) >= TWSE_MIN_ROWS['price']
            and health.get('tpex_price_rows', 0) >= 500
        ):
            sources_complete = True
        if not df_new.empty and len(df_new) >= minimum_rows and sources_complete:
            if os.getenv('TW_DAILY_DEFER_INDICATORS') == '1':
                # 歷史 backfill 先保存官方原料；技術指標由第二階段對完整
                # 日期序列一次重建，避免每個日期重算整段歷史。
                exporter.export_to_json(df_new, "daily/tw", d_str)
                output_path = os.path.join(DATA_ROOT, "daily/tw", f"{d_str}.json")
                try:
                    with open(output_path, 'r', encoding='utf-8') as handle:
                        payload = json.load(handle)
                    payload['source_health'] = health
                    payload['auxiliary_data_status'] = (
                        'complete' if
                        health.get('twse_institutional_rows', 0) >= TWSE_MIN_ROWS['institutional'] and
                        health.get('twse_margin_rows', 0) >= TWSE_MIN_ROWS['margin']
                        else 'deferred'
                    )
                    payload['indicator_status'] = 'deferred'
                    with open(output_path, 'w', encoding='utf-8') as handle:
                        json.dump(payload, handle, ensure_ascii=False, indent=2)
                except (OSError, ValueError, TypeError, json.JSONDecodeError):
                    pass
                latest_success = d_str
                processed_count += 1
                print(f"    ✅ 原始資料已保存 ({len(df_new)} 筆；延後技術指標)")
                continue
            if os.getenv('TW_DAILY_REFRESH_FIELDS_ONLY') == '1':
                # 價量／技術指標已存在且此次僅回補法人、資券欄位時，避免重算
                # 數十萬筆快取；保留原日檔的價格與指標，只以官方當日資料覆寫
                # 對應欄位，適合修復歷史來源空值。
                output_path = os.path.join(DATA_ROOT, "daily/tw", f"{d_str}.json")
                with open(output_path, 'r', encoding='utf-8') as f:
                    output = json.load(f)
                old_rows = output.get('data') or output.get('stocks') or []
                aux_fields = ['f', 'it', 'd', 'mb', 'ms', 'mbl']
                aux_by_id = df_new.set_index('id')[aux_fields].to_dict('index')
                for row in old_rows:
                    if row.get('id') in aux_by_id:
                        row.update(aux_by_id[row['id']])
                output['data'] = old_rows
                output['stocks'] = old_rows
                output['updated_at'] = get_now_tpe().isoformat()
                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump(output, f, ensure_ascii=False, indent=2)
                latest_success = d_str
                processed_count += 1
                print(f"    ✅ 已回補 {len(aux_by_id)} 檔的法人／資券欄位（保留既有價格與指標）")
                continue

            print(f"    🧮 運算技術指標中 (df_history: {len(df_history)} 筆, {len(df_history['date'].unique())} 天)...", flush=True)
            _st = time.time()
            if not df_history.empty:
                last_date = df_history['date'].max()
                if last_date < d_str:
                    prev_day_df = df_history[df_history['date'] == last_date]
                    missing_ids = set(prev_day_df['id']) - set(df_new['id'])
                    if missing_ids:
                        placeholders = []
                        for mid in missing_ids:
                            history_mid = df_history[df_history['id'] == mid]
                            if not history_mid.empty:
                                recent_v = history_mid.tail(15)['v'].tolist()
                                if len(recent_v) >= 15 and all(v == 0 for v in recent_v): continue
                            prev_row = prev_day_df[prev_day_df['id'] == mid].iloc[0]
                            last_c = prev_row['c']
                            if last_c > 0:
                                placeholders.append({"id": mid, "date": d_str, "o": last_c, "h": last_c, "l": last_c, "c": last_c, "v": 0.0, "t": 0.0, "f": 0.0, "it": 0.0, "d": 0.0, "mb": 0.0, "ms": 0.0, "mbl": 0.0})
                        if placeholders:
                            df_new = pd.concat([df_new, pd.DataFrame(placeholders)], ignore_index=True)

            df_slice = df_new[['id', 'date', 'h', 'l', 'c', 'v', 'f', 'it']]
            df_history = pd.concat([df_history, df_slice]).drop_duplicates(['id', 'date'])
            available_dates = sorted(df_history['date'].unique())
            if len(available_dates) > 300:
                df_history = df_history[df_history['date'].isin(available_dates[-300:])]
            
            combined_computed = compute_indicators(df_history, all_actions)
            print(f"    ✅ 指標計算完成 ({time.time()-_st:.1f}s)", flush=True)
            
            # 🚀 v1.33.1: 修正導出邏輯，保留 adj_c 以供 App 使用
            # 排除原始價格與非指標欄位，但保留 adj_c
            indicator_cols = [col for col in combined_computed.columns if col not in ['c', 'v', 'f', 'it', 'h', 'l', 'o', 't']]
            indicators = combined_computed[combined_computed['date'] == d_str][indicator_cols].drop(['date'], axis=1, errors='ignore')
            df_final = pd.merge(df_new, indicators, on='id', how='left')
            
            df_final = df_final.replace({np.nan: None}).replace({float('nan'): None})
            print(f"    💾 寫入 JSON...", end=" ", flush=True)
            _st = time.time()
            exporter.export_to_json(df_final, "daily/tw", d_str)
            print(f"({time.time()-_st:.1f}s)", flush=True)
            
            output_path = os.path.join(DATA_ROOT, "daily/tw", f"{d_str}.json")
            try:
                with open(output_path, 'r', encoding='utf-8') as f:
                    json.load(f)
            except json.JSONDecodeError:
                print(f"\n❌ JSON validation failed, removing corrupt file: {output_path}")
                os.remove(output_path)
                continue
            
            latest_success = d_str; processed_count += 1
            print(f"✅ 成功 ({len(df_final)} 筆)")
        else:
            # 讓 workflow 顯式失敗，下一次排程會以不完整檔案的判斷自動回補。
            raise RuntimeError(f"{d_str} 關鍵 TWSE 來源不完整，未寫入日檔：{health}")
            
    if not df_history.empty:
        df_history.to_csv(cache_path, index=False, compression='gzip')
            
    if latest_success:
        exporter.update_index("latest_daily_tw", latest_success)

if __name__ == "__main__":
    main()
