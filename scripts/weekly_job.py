import pandas as pd
import numpy as np
import requests
import io
import os
import re
from datetime import datetime, timedelta
from github_utils import GitHubDataExporter
import bisect

# 🚀 v1.26.0: 終極價格對位版 (純字串匹配 + 三層遞補)
exporter = GitHubDataExporter()

def fetch_tdcc_latest():
    url = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5"
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        resp = requests.get(url, headers=headers, timeout=30, verify=False)
        if resp.status_code == 200:
            df = pd.read_csv(io.StringIO(resp.content.decode('utf-8-sig')), dtype={'id': str})
            df.columns = ['date', 'id', 'level', 'holders', 'shares', 'percent']
            return df
    except Exception as e: print(f"⚠️ 下載 TDCC 失敗: {e}")
    return pd.DataFrame()

def run_weekly():
    print("📡 啟動 TDCC 同步程序 (雲端精確對位 V3.0)...")
    df_raw = fetch_tdcc_latest()
    if df_raw.empty: return
    
    try:
        # 🚀 1. 解析 ISO 週並推算該週週五 (Friday) 作為價格基準日
        raw_date = str(df_raw['date'].iloc[0])
        dt_input = datetime.strptime(raw_date, '%Y%m%d')
        iso_year, iso_week, _ = dt_input.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"
        
        # 取得該 ISO 週的週五
        friday_dt = datetime.strptime(f"{iso_year} {iso_week} 5", "%G %V %u")
        friday_str = friday_dt.strftime("%Y-%m-%d")
        print(f"📅 目標週別: {week_key} (價格對位日: {friday_str})")
    except Exception as e:
        print(f"❌ 日期解析失敗: {e}")
        return

    # 🚀 2. 獲取價格快取 (優先從 GitHub Pages 抓取)
    price_lookup = {}
    price_dates = {}
    global_last_map = {}
    
    cache_path = os.path.join(exporter.base_path, "meta", "fast_history_tw.csv.gz")
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    
    # 嘗試從雲端預載入快取 (GitHub Actions 環境必要步驟)
    remote_cache_url = f"https://alien0077.github.io/Public_Data/data/meta/fast_history_tw.csv.gz"
    try:
        print(f"⏳ 正在從雲端同步價格快取...")
        r = requests.get(remote_cache_url, timeout=20)
        if r.status_code == 200:
            with open(cache_path, 'wb') as f: f.write(r.content)
            print("  ✅ 成功獲取最新價格快取。")
    except: 
        print("  ⚠️ 無法連結雲端快取，將嘗試使用本地舊有資料。")

    try:
        if os.path.exists(cache_path):
            pdf = pd.read_csv(cache_path, compression='gzip', dtype={'id': str})
            # 🚀 關鍵型別校準：確保 id 是乾淨的字串 (相容 2330.0 -> 2330, 及 00400A)
            pdf['id'] = pdf['id'].astype(str).str.replace(r'\.0$', '', regex=True).replace('nan', '')
            pdf['date'] = pdf['date'].astype(str).str.strip()
            
            pdf['c'] = pd.to_numeric(pdf['c'], errors='coerce').fillna(0.0)
            
            for sid, group in pdf.groupby('id'):
                if not sid or sid == 'nan': continue
                price_lookup[sid] = dict(zip(group['date'], group['c']))
                price_dates[sid] = sorted(group['date'].tolist())
                global_last_map[sid] = float(group.iloc[-1]['c'])
            print(f"📊 價格對位矩陣已就緒 (共 {len(price_lookup)} 檔股票)")
    except Exception as e:
        print(f"⚠️ 價格快取讀取失敗: {e}")

    # 🚀 關鍵型別校準：相容全型別 ID (如 2330, 0050, 00631L, 00400A)
    # 這裡絕對不能用 float() 或 int()，因為 ID 可能包含英文字母
    df_raw['id'] = df_raw['id'].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
    df = df_raw[df_raw['id'].str.len().between(4, 6)].copy()
    
    # 載入有效標清單
    valid_symbols = set()
    try:
        stocks_url = "https://alien0077.github.io/Public_Data/data/meta/stocks.json"
        s_resp = requests.get(stocks_url, timeout=15)
        if s_resp.status_code == 200:
            valid_symbols = {s['symbol'] for s in s_resp.json().get('stocks', [])}
    except: pass

    summary = []
    grouped = df.groupby('id')
    for sid, gdf in grouped:
        if valid_symbols and sid not in valid_symbols: continue
        total_row = gdf[gdf['level'] == 17]
        if total_row.empty: continue
        
        r400 = gdf[gdf['level'].isin([12, 13, 14, 15])]['percent'].sum()
        r1000 = gdf[gdf['level'] == 15]['percent'].sum() if not gdf[gdf['level'] == 15].empty else 0.0
        
        # 🎯 執行精確價格對位引擎 (同維護任務級別)
        price = 0.0
        if sid in price_lookup:
            stock_data = price_lookup[sid]
            stock_dates_list = price_dates[sid]
            
            # A. 週五價
            if friday_str in stock_data:
                price = stock_data[friday_str]
            else:
                # B. 週平均或最近交易日
                wp = []
                for i in range(5):
                    d = (friday_dt - timedelta(days=i)).strftime("%Y-%m-%d")
                    if d in stock_data: wp.append(stock_data[d])
                if wp: price = sum(wp) / len(wp)
                else:
                    # C. 最近成交 (找出日期 <= friday_str 的最後一項)
                    idx = bisect.bisect_right(stock_dates_list, friday_str)
                    if idx > 0: price = stock_data[stock_dates_list[idx-1]]
        
        # D. 最終備援
        if price == 0: price = global_last_map.get(sid, 0.0)

        summary.append({
            "id": sid, "holders": int(total_row['holders'].values[0]),
            "r400": round(float(r400), 2), "r1000": round(float(r1000), 2),
            "price": round(float(price), 2)
        })
    
    if len(summary) >= 1500:
        df_final = pd.DataFrame(summary)
        df_final = df_final.replace({np.nan: None}) # 物理 NaN 清洗
        exporter.export_to_json(df_final, "weekly", week_key)
        exporter.update_index("latest_weekly", week_key)
        print(f"🏁 {week_key} 同步完成！")

if __name__ == "__main__":
    run_weekly()
