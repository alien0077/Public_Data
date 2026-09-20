import pandas as pd
import requests
import os
import re
import time
import urllib3
import csv
import io
import numpy as np
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup
from github_utils import GitHubDataExporter

# 🚀 v1.2: 台股指數同步引擎 (支援指標預算)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
exporter = GitHubDataExporter()
session = requests.Session()
HEADERS = {'User-Agent': 'Mozilla/5.0'}

# 🚀 Fugle API 限流器（免費方案 30 req/min）
_fugle_timestamps = []
FUGLE_MAX_RPM = 28  # 保留緩衝


def _fugle_rate_limit():
    global _fugle_timestamps
    now = time.time()
    _fugle_timestamps = [t for t in _fugle_timestamps if now - t < 60]
    if len(_fugle_timestamps) >= FUGLE_MAX_RPM:
        sleep_time = 60 - (now - _fugle_timestamps[0])
        if sleep_time > 0:
            time.sleep(sleep_time)
        _fugle_timestamps = _fugle_timestamps[1:]
    _fugle_timestamps.append(time.time())


def fetch_fugle_volume(symbol, target_date):
    """從 Fugle API intraday/quote 取得即時成交量

    symbol: IX0001 或 IX0043（Fugle 用數字 stock_id，但 IX prefix 也支援）
    回傳 volume int，或 None
    """
    api_key = os.environ.get("FUGLE_API_KEY", "")
    if not api_key:
        return None
    _fugle_rate_limit()
    url = f"https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/{symbol}"
    try:
        resp = session.get(url, timeout=10, headers={"X-API-KEY": api_key})
        if resp.status_code == 200:
            data = resp.json()
            vol = data.get("total", {}).get("tradeVolume")
            if vol is not None and vol > 0:
                vol_i = int(vol * 1000)
                print(f"🔁 Fugle API 成功 ({symbol}): {vol_i:,}", end="", flush=True)
                return vol_i
    except Exception as e:
        print(f"  ⚠️ Fugle error: {e}", end="", flush=True)
    return None

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

def fetch_history_with_indicators(symbol, start_date):
    """ 從 Yahoo 抓取歷史數據並預算所有技術指標 """
    print(f"📡 正在請求 Yahoo 資料: {symbol}...")
    # 為了指標準確，向前多抓 365 天
    dt_start = datetime.strptime(start_date, "%Y-%m-%d")
    p1 = int((dt_start - timedelta(days=500)).timestamp())
    p2 = int(time.time())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={p1}&period2={p2}&interval=1d"
    
    for attempt in range(1, 4):
        try:
            resp = session.get(url, timeout=20, headers=HEADERS)
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code}")
            result = (resp.json().get('chart', {}).get('result') or [{}])[0]
            ts = result.get('timestamp') or []
            q = (result.get('indicators', {}).get('quote') or [{}])[0]
            required = ('open', 'high', 'low', 'close', 'volume')
            if not ts or any(key not in q for key in required):
                raise RuntimeError(f"Yahoo 回應缺少 K 線欄位：{sorted(result.keys())}")
            
            df = pd.DataFrame({
                'date': [datetime.fromtimestamp(t, ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d") for t in ts],
                'o': q['open'], 'h': q['high'], 'l': q['low'], 'c': q['close'], 'v': [vol * 1000 if vol is not None else None for vol in q['volume']]
            })
            
            print(f"  📊 {symbol} 抓取成功 ({len(df)} 筆)，計算指標中...")
            
            # 計算指標
            for w in [5, 10, 20, 60, 120, 240]:
                df[f'ma{w}'] = df['c'].rolling(w, min_periods=1).mean().round(2)
            df['vma20'] = df['v'].rolling(20, min_periods=1).mean().round(0)
            df['rsi'] = compute_rsi(df['c'], 14).round(2)
            
            # 🚀 修正 FutureWarning
            df['pct'] = (df['c'].pct_change(fill_method=None) * 100).round(2)
            
            # 轉回字典 (僅保留 start_date 之後的資料)
            df_final = df[df['date'] >= start_date].replace({np.nan: None})
            return df_final.set_index('date').to_dict('index')
        except (requests.RequestException, ValueError, RuntimeError, KeyError, TypeError) as exc:
            print(f"  ⚠️ Yahoo {symbol} 第 {attempt}/3 次失敗：{exc}")
            if attempt < 3:
                time.sleep(attempt * 3)
    return {}

def fetch_twse_fmtqik_volume(target_date):
    """從 TWSE FMTQIK API 取得大盤當日成交金額（台股指數用）

    回傳成交金額 NTD（int），或 None
    """
    dt = datetime.strptime(target_date, "%Y-%m-%d")
    y, m = dt.year, dt.month
    url = f"https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date={y}{m:02d}01"
    try:
        resp = session.get(url, timeout=15, headers=HEADERS)
        if resp.status_code == 200:
            data = resp.json()
            for row in data.get('data', []):
                parts = row[0].split('/')
                yr = int(parts[0]) + 1911
                ds = f"{yr}-{parts[1]}-{parts[2]}"
                if ds == target_date:
                    return int(row[2].replace(',', ''))
    except Exception as e:
        print(f"  ⚠️ FMTQIK error: {e}", end="", flush=True)
    return None


def fetch_twse_mis_index(index_type, date_str):
    """Fallback: 從 TWSE MIS 行情 API 取得指數 OHLCV（不含 volume）

    index_type: 'tse' for TAIEX (tse_t00.tw), 'otc' for OTC (otc_o00.tw)
    Returns: dict with 'o','h','l','c','v' or None
    v 固定傳 0，volume 統一由 retry_volume 處理
    （MIS m 欄位僅對最新日有效，歷史日期不適用）
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    date_fmt = dt.strftime("%Y%m%d")
    suffix = "t00" if index_type == "tse" else "o00"
    url = f"https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={index_type}_{suffix}.tw_{date_fmt}"
    try:
        resp = session.get(url, timeout=15, headers=HEADERS)
        if resp.status_code == 200:
            data = resp.json()
            arr = data.get('msgArray', [])
            if arr:
                r = arr[0]
                close = r.get('z')
                if close is not None and close != '-' and close != '':
                    close = float(close)
                    return {
                        'o': float(r.get('o', close)) if r.get('o') not in (None, '-', '') else close,
                        'h': float(r.get('h', close)) if r.get('h') not in (None, '-', '') else close,
                        'l': float(r.get('l', close)) if r.get('l') not in (None, '-', '') else close,
                        'c': close,
                        'v': 0
                    }
    except Exception as e:
        print(f"  ⚠️ TWSE MIS error: {e}", end="", flush=True)
    return None

def fetch_yahoo_web_summary(yahoo_symbol, target_date):
    """Ultimate fallback: 爬取 Yahoo Finance 網頁版摘要資料
    
    僅對 target_date == 昨天/今天 有效
    從頁面提取: 當前價(close)、Open、Day's Range、Volume
    Returns: dict with 'o','h','l','c','v' or None
    """
    now_tpe = get_now_tpe()
    today_str = now_tpe.strftime("%Y-%m-%d")
    yesterday_str = (now_tpe - timedelta(days=1)).strftime("%Y-%m-%d")

    if target_date not in (yesterday_str, today_str):
        return None

    WEB_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/'
    }

    url = f"https://finance.yahoo.com/quote/{yahoo_symbol}/"
    try:
        resp = session.get(url, timeout=15, headers=WEB_HEADERS)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            page_text = soup.get_text()

            def extract_value(label):
                idx = page_text.find(label)
                if idx >= 0:
                    chunk = page_text[idx:idx+60]
                    m = re.search(r'([\d,]+\.?\d*)', chunk)
                    if m:
                        return float(m.group(1).replace(',', ''))
                return None

            # 提取當前價: 找 "XX,XXX.XX +X.XX%" 模式 (含逗號千分位)
            current_price = None
            prices = re.findall(r'(\d{1,3}(?:,\d{3})+\.\d{2})\s*[+-]\d+\.\d{2}%', page_text)
            if prices:
                current_price = float(prices[0].replace(',', ''))

            open_val = extract_value('Open')
            volume = extract_value('Volume')

            day_range = None
            idx = page_text.find("Day's Range")
            if idx >= 0:
                chunk = page_text[idx:idx+80]
                nums = re.findall(r'([\d,]+\.?\d*)', chunk)
                if len(nums) >= 2:
                    day_low = float(nums[0].replace(',', ''))
                    day_high = float(nums[1].replace(',', ''))
                    day_range = (day_low, day_high)

            close = current_price
            if close is not None:
                o = open_val or close
                h = day_range[1] if day_range else close
                l = day_range[0] if day_range else close
                v = int(volume) if volume is not None else 0
                return {'o': o, 'h': h, 'l': l, 'c': close, 'v': v}
    except Exception as e:
        print(f"  ⚠️ Yahoo Web Summary error: {e}", end="", flush=True)

    return None

def retry_volume(yahoo_symbol, index_id, target_date):
    """當 daily API volume=0 時，嘗試 TWSE FMTQIK → Yahoo 1m intraday 加總

    回傳 volume int（Yahoo 尺度：×1000），或 None。
    """
    # --- 1. TWSE FMTQIK（台股指數，免費，無配額限制）---
    if yahoo_symbol in ("%5ETWII", "^TWII"):
        twse = fetch_twse_fmtqik_volume(target_date)
        if twse and twse > 0:
            scale = int(twse * 0.0057)
            if scale > 0:
                print(f"🔁 TWSE FMTQIK 成功 ({index_id}): {scale:,}", end="", flush=True)
                return scale

    # --- 2. TWSE MIS m 欄位（TSE + OTC，僅最新交易日有效，免費無限制）---
    now_tpe = get_now_tpe()
    mis_date = now_tpe.strftime("%Y-%m-%d")
    if target_date == mis_date:
        TWSE_MIS_MAP = {"%5ETWII": "tse", "%5ETWOII": "otc", "^TWII": "tse", "^TWOII": "otc"}
        if yahoo_symbol in TWSE_MIS_MAP:
            res = fetch_twse_mis_index(TWSE_MIS_MAP[yahoo_symbol], target_date)
            if res and res.get('c') is not None:
                # MIS API 對指數不回傳歷史，但最新日的 m 欄位 = 成交股數 = 正確 volume
                suffix = "t00" if TWSE_MIS_MAP[yahoo_symbol] == "tse" else "o00"
                dt = datetime.strptime(target_date, "%Y-%m-%d")
                url = f"https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={TWSE_MIS_MAP[yahoo_symbol]}_{suffix}.tw_{dt.strftime('%Y%m%d')}"
                try:
                    r = requests.get(url, timeout=10, headers=HEADERS).json()
                    m_raw = r['msgArray'][0].get('m', '0')
                    vol = int(m_raw.replace(',', '')) * 1000
                    if vol > 0:
                        print(f"🔁 TWSE MIS m 成功 ({index_id}): {vol:,}", end="", flush=True)
                        return vol
                except Exception:
                    pass

    # --- 3. Fugle API（TSE + OTC，僅最新交易日有效，28 req/min 限流）---
    fugle_date = get_now_tpe().strftime("%Y-%m-%d")
    if target_date == fugle_date:
        fugle_sym = "IX0001" if index_id == "IX0001" else "IX0043"
        fugle_vol = fetch_fugle_volume(fugle_sym, target_date)
        if fugle_vol is not None:
            return fugle_vol

    # --- 4. OTC 歷史缺漏 Hardcode（Yahoo 永遠不給的日期，以前後日平均估計）---
    OTC_HARDCODE = {
        "2024-05-27": 1294950000, "2024-07-01": 1219050000,
        "2024-07-02": 1224800000, "2024-12-09": 816125000,
        "2024-12-10": 804266000,
        "2026-06-22": 1200000000, "2026-06-23": 1300000000,
        "2026-06-24": 1300000000, "2026-06-25": 1300000000,
    }
    if index_id == "IX0043" and target_date in OTC_HARDCODE:
        print(f"🔁 OTC hardcode ({target_date}): {OTC_HARDCODE[target_date]:,}", end="", flush=True)
        return OTC_HARDCODE[target_date]

    # --- 5. Yahoo 1m intraday 加總（僅近 7 日有效）---
    now_tpe = get_now_tpe()
    target_dt = datetime.strptime(target_date, "%Y-%m-%d").replace(tzinfo=ZoneInfo("Asia/Taipei"))
    diff = (now_tpe - target_dt).days
    if diff <= 7:
        for attempt in range(3):
            try:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}?range=1d&interval=1m"
                resp = session.get(url, timeout=20, headers=HEADERS)
                if resp.status_code == 200:
                    result = resp.json()['chart']['result'][0]
                    ts = result['timestamp']
                    q = result['indicators']['quote'][0]
                    total_vol = 0.0
                    for i, t in enumerate(ts):
                        dt_str = datetime.fromtimestamp(t, ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
                        if dt_str == target_date and q['close'][i] is not None:
                            v = q['volume'][i]
                            if v is not None:
                                total_vol += v * 1000
                    if total_vol > 0:
                        print(f"🔁 1m summed volume 成功 ({index_id}): {total_vol:.0f}", end="", flush=True)
                        return int(total_vol)
            except Exception:
                pass
            if attempt < 2:
                time.sleep(2)

    return None


def retry_index_close(yahoo_symbol, index_id, target_date, max_retries=5, delay=5):
    """當 bulk fetch 回傳 close=None，對特定日期進行 retry + fallback。
    
    Strategy:
    1. Narrow-range v8/finance/chart (±3 天) — 有時單日請求比 bulk 更快產出
    1.5 Intraday 1m (range=1d, interval=1m) — 同 iOS 做法，對最新交易日可靠
    2. v7/finance/quote — 即時報價端點，只對昨天/今天收盤有效
    3. TWSE MIS 官方行情 API — 不同來源，支援任何日期
    4. Yahoo Finance 網頁版摘要 — 僅昨日/今日
    5. Meta-only extraction (IX0043.TWO) — 某些 symbol 有 meta 無 K 線
    
    Returns: dict with 'o','h','l','c','v' or None
    """
    Q_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://finance.yahoo.com/'
    }
    dt_target = datetime.strptime(target_date, "%Y-%m-%d")
    now_tpe = get_now_tpe()
    today_str = now_tpe.strftime("%Y-%m-%d")
    yesterday_str = (now_tpe - timedelta(days=1)).strftime("%Y-%m-%d")

    for attempt in range(max_retries):
        # --- 1. Narrow-range v8/finance/chart ---
        p1 = int((dt_target - timedelta(days=3)).timestamp())
        p2 = int((dt_target + timedelta(days=3)).timestamp())
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}?period1={p1}&period2={p2}&interval=1d"
        try:
            resp = session.get(url, timeout=20, headers=HEADERS)
            if resp.status_code == 200:
                result = resp.json()['chart']['result'][0]
                ts = result['timestamp']
                q = result['indicators']['quote'][0]
                for i, t in enumerate(ts):
                    dt_str = datetime.fromtimestamp(t, ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
                    if dt_str == target_date and q['close'][i] is not None:
                        vol = (q['volume'][i] * 1000) if q['volume'][i] is not None else 0
                        print(f"🔁 chart retry 成功 ({index_id})", end="", flush=True)
                        return {
                            'o': q['open'][i] if q['open'][i] is not None else q['close'][i],
                            'h': q['high'][i] if q['high'][i] is not None else q['close'][i],
                            'l': q['low'][i] if q['low'][i] is not None else q['close'][i],
                            'c': q['close'][i],
                            'v': vol
                        }
        except Exception as e:
            print(f"  ⚠️ chart retry error: {e}", end="", flush=True)

        # --- 1.5 Intraday 1m fallback (同 iOS 做法：range=1d, interval=1m) ---
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}?range=1d&interval=1m"
            resp = session.get(url, timeout=20, headers=HEADERS)
            if resp.status_code == 200:
                result = resp.json()['chart']['result'][0]
                ts = result['timestamp']
                q = result['indicators']['quote'][0]
                for i in range(len(ts) - 1, -1, -1):
                    dt_str = datetime.fromtimestamp(ts[i], ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
                    if dt_str == target_date and q['close'][i] is not None:
                        vol = (q['volume'][i] * 1000) if q['volume'][i] is not None else 0
                        print(f"🔁 intraday 1m retry 成功 ({index_id})", end="", flush=True)
                        return {
                            'o': q['open'][i] if q['open'][i] is not None else q['close'][i],
                            'h': q['high'][i] if q['high'][i] is not None else q['close'][i],
                            'l': q['low'][i] if q['low'][i] is not None else q['close'][i],
                            'c': q['close'][i],
                            'v': vol
                        }
        except Exception as e:
            print(f"  ⚠️ intraday 1m error: {e}", end="", flush=True)

        # --- 2. v7/finance/quote (僅 target 為昨天或今天收盤後有用) ---
        if target_date in (yesterday_str, today_str):
            for host in ['query2', 'query1']:
                try:
                    resp = session.get(
                        f"https://{host}.finance.yahoo.com/v7/finance/quote?symbols={yahoo_symbol}",
                        timeout=10, headers=Q_HEADERS
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        rl = data.get('quoteResponse', {}).get('result', [])
                        if rl:
                            r = rl[0]
                            if target_date == today_str and now_tpe.hour >= 14:
                                close = r.get('regularMarketPrice')
                            elif target_date == yesterday_str:
                                close = r.get('regularMarketPreviousClose')
                            else:
                                close = None
                            if close is not None:
                                print(f"🔁 v7/quote retry 成功 ({index_id})", end="", flush=True)
                                return {'o': close, 'h': close, 'l': close, 'c': close, 'v': 0}
                except Exception:
                    pass

        if attempt < max_retries - 1:
            print(f"⏳ 等待 {delay}s 重試 ({attempt+2}/{max_retries})...", end=" ", flush=True)
            time.sleep(delay)

    # --- 3. TWSE MIS 官方行情 API (完全獨立於 Yahoo，支援任何日期) ---
    TWSE_INDEX_MAP = {"%5ETWII": "tse", "%5ETWOII": "otc", "^TWII": "tse", "^TWOII": "otc"}
    if yahoo_symbol in TWSE_INDEX_MAP:
        result = fetch_twse_mis_index(TWSE_INDEX_MAP[yahoo_symbol], target_date)
        if result:
            print(f"🔁 TWSE MIS fallback 成功 ({index_id})", end="", flush=True)
            return result

    # --- 4. Yahoo Finance 網頁版摘要 (僅對今昨有效) ---
    result = fetch_yahoo_web_summary(yahoo_symbol, target_date)
    if result:
        print(f"🔁 Yahoo Web Summary fallback 成功 ({index_id})", end="", flush=True)
        return result

    # --- 5. Meta-only extraction (IX0043.TWO 有 meta 無 K 線) ---
    for alt in ["IX0043.TWO", "%5ETWOII"]:
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{alt}?range=1d&interval=1d"
            resp = session.get(url, timeout=20, headers=HEADERS)
            if resp.status_code == 200:
                result = resp.json()['chart']['result'][0]
                meta = result.get('meta', {})
                close = meta.get('regularMarketPrice')
                if close is not None:
                    print(f"🔁 meta extract 成功 via {alt} ({index_id})", end="", flush=True)
                    return {'o': close, 'h': close, 'l': close, 'c': close, 'v': 0}
        except Exception:
            pass

    return None


def load_remote_calendar():
    url = "https://alien0077.github.io/Public_Data/data/meta/calendar.json"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200: return r.json()
    except: pass
    return None

def get_latest_indices_date():
    indices_dir = os.path.join(exporter.base_path, "daily", "tw_indices")
    if not os.path.isdir(indices_dir):
        return None
    dates = [f[:-5] for f in os.listdir(indices_dir) if f.endswith(".json")]
    return max(dates) if dates else None

def get_local_indices_dates():
    indices_dir = os.path.join(exporter.base_path, "daily", "tw_indices")
    if not os.path.isdir(indices_dir):
        return set()
    return {f[:-5] for f in os.listdir(indices_dir) if f.endswith(".json")}


def get_local_tw_dates():
    """以已成功寫入的台股日檔作為指數資料的完整性基準。"""
    tw_dir = os.path.join(exporter.base_path, "daily", "tw")
    if not os.path.isdir(tw_dir):
        return set()
    return {f[:-5] for f in os.listdir(tw_dir) if f.endswith(".json")}

def main():
    print("📡 啟動台股指數歷史同步引擎 (V1.3 - 智能對位版)...")
    now_tpe = get_now_tpe()
    
    # 🚀 v1.4: 以 daily/tw_indices/ 本地目錄為日期基準
    latest_indices_date = get_latest_indices_date()
    existing_local = get_local_indices_dates()
    expected_tw_dates = get_local_tw_dates()
    if latest_indices_date:
        print(f"📅 本地指數最新日期: {latest_indices_date}")
    
    # 指數檔必須與已產出的台股日檔逐日對齊；不能因 Yahoo 暫時失效而
    # 把缺件當成「沒有需要處理」。
    if expected_tw_dates:
        latest_indices_date = max(expected_tw_dates)

    # 0. 獲取日曆資料
    cal_data = load_remote_calendar()
    tw_holidays = set()
    years_data = None
    if cal_data:
        if "years" in cal_data: years_data = cal_data["years"]
        elif "meta" in cal_data and "years" in cal_data["meta"]: years_data = cal_data["meta"]["years"]
    if years_data:
        for yr in years_data: tw_holidays.update(years_data[yr].get("tw", []))

    # 1. 以本地 daily/tw_indices/ 目錄為跳過清單 (rebuild_index.py 在最後才執行，不能依賴 index.json)
    existing_dates = existing_local
    
    # 2. 抓取大盤歷史與櫃買歷史 (含指標)
    print("⏳ 正在從 Yahoo 獲取並計算歷史指標...")
    tse_history = fetch_history_with_indicators("%5ETWII", "2024-01-01")

    otc_history = fetch_history_with_indicators("%5ETWOII", "2024-01-01")
    otc_valid = sum(1 for d in otc_history.values() if d.get('c') is not None)
    for fallback in ["OTC", "TWOII", "IX0043", "IX0043.TWO"]:
        if otc_valid > 0:
            break
        print(f"⚠️ ^TWOII 欠缺收盤價，嘗試 {fallback} 備援符號...")
        otc_history = fetch_history_with_indicators(fallback, "2024-01-01")
        otc_valid = sum(1 for d in otc_history.values() if d.get('c') is not None)
    
    # 🚀 偵錯：列印 Yahoo 最後幾筆日期
    if tse_history:
        print(f"  🔍 Yahoo TSE 最後 5 天: {sorted(list(tse_history.keys()))[-5:]}")
    if otc_history:
        print(f"  🔍 Yahoo OTC 最後 5 天: {sorted(list(otc_history.keys()))[-5:]}")
    
    # 3. 交易日集合以已成功產出的 daily/tw JSON 為權威。
    # 這同時保留「補中間缺洞」能力，並避免對週末/休市日做任何 retry。
    # 不能只從最新 cursor 往後補，否則中間漏檔會永久遺失。
    trading_dates = expected_tw_dates
    missing_dates = sorted(trading_dates - existing_dates)

    # 🚀 v1.3.8: 手動補償機制 (針對 Yahoo 損壞或缺失的歷史日期)
    HARDCODED_INJECTION = {
        "2024-12-24": {
            "IX0043": {"o": 254.5, "h": 257.5, "l": 254.5, "c": 255.3, "v": 91400000000, "pct": 0.44}
        },
        "2024-12-25": {
            "IX0043": {"o": 255.5, "h": 257.2, "l": 255.5, "c": 256.4, "v": 90900000000, "pct": 0.43}
        }
    }
    
    # 強制將手動補償日期加入處理清單 (如果雲端還沒有)
    for d in HARDCODED_INJECTION:
        if d not in existing_dates and d not in missing_dates:
            missing_dates.append(d)
    
    missing_dates = sorted(list(set(missing_dates)))

    if not missing_dates:
        print("✅ 數據已是對位狀態，無需更新。")
        return

    print(f"🚀 發現缺口日期: {missing_dates}")
    print(f"🚀 準備補全 {len(missing_dates)} 天缺失資料...")
    
    latest_success = None
    processed_count = 0
    failed_dates = []

    for d_str in missing_dates:
        print(f"  ➜ 檢查日期: {d_str}...", end=" ")

        # 🚀 v1.3.3: 整合休市判斷
        dt = datetime.strptime(d_str, "%Y-%m-%d")
        if dt.weekday() >= 5 or d_str in tw_holidays:
            print("⏭️ 休市日")
            continue
            
        # 僅當缺口本身就是台北今日日期時才視為盤中；昨日已收盤資料
        # 不應因 latest_daily_tw 的日期值而被錯誤跳過。
        if d_str == now_tpe.strftime("%Y-%m-%d") and now_tpe.hour < 14:
            print("⏭️ 今日盤中，跳過")
            continue
            
        print(f"📦 正在產出 JSON...", end=" ", flush=True)
        recs = []
        is_data_valid = True

        # 🚀 v1.3.6: 智慧型資料檢查 (指數資料容許度優化)
        # 對於指數，c (Close) 是核心。o/h/l 缺失則用 c 代替，v 缺失則預設為 0
        def fix_index_item(item, date_str, index_id):
            if item.get('c') is None:
                print(f"⚠️ {index_id} 欠缺收盤價 ({date_str})", end=" ")
                return None
            
            # 補齊 O/H/L
            for k in ['o', 'h', 'l']:
                if item.get(k) is None: item[k] = item['c']
            # 補齊成交量
            if item.get('v') is None: item['v'] = 0
            
            return item

        item = {"id": "IX0001"}
        if d_str in tse_history:
            item.update(tse_history[d_str])
        # 🚀 注入機制
        if d_str in HARDCODED_INJECTION and "IX0001" in HARDCODED_INJECTION[d_str]:
            item.update(HARDCODED_INJECTION[d_str]["IX0001"])
        # 🚀 v1.4: 若 close 遺失，啟動 retry fallback
        if item.get('c') is None:
            fallback = retry_index_close("%5ETWII", "IX0001", d_str)
            if fallback:
                item.update(fallback)

        fixed = fix_index_item(item, d_str, "IX0001")
        if fixed and (fixed.get('v') is None or fixed.get('v') == 0):
            vol = retry_volume("%5ETWII", "IX0001", d_str)
            if vol is not None:
                fixed['v'] = vol
        if fixed: recs.append(fixed)
        else: is_data_valid = False
            
        item = {"id": "IX0043"}
        if d_str in otc_history:
            item.update(otc_history[d_str])

        # 🚀 注入機制
        if d_str in HARDCODED_INJECTION and "IX0043" in HARDCODED_INJECTION[d_str]:
            item.update(HARDCODED_INJECTION[d_str]["IX0043"])
        # 🚀 v1.4: 若 close 遺失，啟動 retry fallback
        if item.get('c') is None:
            fallback = retry_index_close("%5ETWOII", "IX0043", d_str)
            if fallback:
                item.update(fallback)
            
        fixed = fix_index_item(item, d_str, "IX0043")
        if fixed and (fixed.get('v') is None or fixed.get('v') == 0):
            vol = retry_volume("%5ETWOII", "IX0043", d_str)
            if vol is not None:
                fixed['v'] = vol
        if fixed: recs.append(fixed)
        else: is_data_valid = False
            
        if is_data_valid and len(recs) == 2:
            # 🚀 v1.3.5: 統一使用 exporter 並確保格式一致
            df_indices = pd.DataFrame(recs)
            exporter.export_to_json(df_indices, "daily/tw_indices", d_str)
            latest_success = d_str
            processed_count += 1
            print(f"✅ 成功")
        else:
            if not is_data_valid:
                print("❌ 資料含空值，放棄產出以待補救。")
            elif len(recs) < 2:
                print("❌ 缺少其中一個指數資料，放棄產出。")
            else:
                print("❌ Yahoo 無對應紀錄")
            failed_dates.append(d_str)

    if latest_success:
        exporter.update_index("latest_daily_tw_indices", latest_success)
        print(f"🏁 同步結束，最新日期: {latest_success}, 本次處理: {processed_count} 筆")
    if failed_dates:
        raise RuntimeError(f"台股指數資料未完整產出：{', '.join(failed_dates)}")

if __name__ == "__main__":
    main()
