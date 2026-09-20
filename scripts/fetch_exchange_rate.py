import pandas as pd
import yfinance as yf
import json
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from github_utils import GitHubDataExporter

# 🚀 v1.3.4: 修正 GitHub Actions (UTC) 導致的匯率日期落後問題
# 🎯 強制使用台北時區計算邊界日期

OUTPUT_PATH = "data/meta/exchange_rate_history.json"
# yfinance 匯率 Ticker 對照表
CURRENCY_MAP = {
    "USD_TWD": "USDTWD=X",
    "JPY_TWD": "JPYTWD=X",
    "EUR_TWD": "EURTWD=X",
    "KRW_TWD": "KRWTWD=X",
    "AUD_TWD": "AUDTWD=X",
    "THB_TWD": "THBTWD=X",
    "HKD_TWD": "HKDTWD=X",
    "CNY_TWD": "CNYTWD=X",
    "VND_TWD": "VNDTWD=X",
    "MYR_TWD": "MYRTWD=X",
    "IDR_TWD": "IDRTWD=X",
    "GBP_TWD": "GBPTWD=X"
}

def fetch_history_from_yfinance():
    print(f"📡 啟動匯率歷史抓取 (來源: yfinance)...")
    
    # 🚀 修正：強制取得台北時間，避免 GitHub VM (UTC) 造成的日期判定落後
    now_tpe = datetime.now(ZoneInfo("Asia/Taipei"))
    today_tpe = now_tpe.date()
    
    # end 日期在 yfinance 是 Exclusive，且為了應對 FX 更新延遲，多推 2 天
    end_date = today_tpe + timedelta(days=2)
    start_date = today_tpe - timedelta(days=380)
    
    print(f"📅 台北時間: {now_tpe.strftime('%Y-%m-%d %H:%M:%S')} (抓取區間: {start_date} -> {end_date})")
    
    all_df = pd.DataFrame()
    
    for label, ticker in CURRENCY_MAP.items():
        try:
            print(f"📥 正在下載 {label} ({ticker})...")
            # 抓取資料
            data = yf.download(ticker, start=start_date, end=end_date, progress=False)
            if not data.empty:
                if isinstance(data.columns, pd.MultiIndex):
                    df_curr = data['Close'].iloc[:, 0].to_frame(name=label)
                else:
                    df_curr = data[['Close']].rename(columns={'Close': label})
                
                df_curr.index = df_curr.index.date
                
                if all_df.empty:
                    all_df = df_curr
                else:
                    all_df = all_df.join(df_curr, how='outer')
        except Exception as e:
            print(f"⚠️ 下載 {label} 失敗: {e}")

    if all_df.empty:
        return None

    # 1. 補齊 TWD_TWD 基準
    all_df['TWD_TWD'] = 1.0

    # 2. 執行 Forward Fill (時間序列補齊)
    all_df.index = pd.to_datetime(all_df.index)
    # 🚀 核心修正：強制讓日期範圍延伸到台北時間的「今天」
    full_range = pd.date_range(start=all_df.index.min(), end=today_tpe, freq='D')
    all_df = all_df.reindex(full_range).ffill()
    
    # 3. 滾動截取最近 365 天
    all_df = all_df.tail(365)
    
    # 4. 格式化輸出
    all_df.index.name = 'date'
    df_final = all_df.reset_index()
    df_final['date'] = df_final['date'].dt.strftime('%Y-%m-%d')
    
    # 🚀 v1.3.2: 強制將所有欄位名稱轉為字串，徹底防止 JSON 序列化 tuple 報錯
    df_final.columns = [str(c) for c in df_final.columns]
    
    for col in df_final.columns:
        if col == 'date': continue
        # 強制轉換為 float
        df_final[col] = pd.to_numeric(df_final[col], errors='coerce')
        
        # 🚀 v1.3.5: 根據匯率大小自動調整精確度
        if any(k in col for k in ['KRW', 'VND', 'IDR']):
            precision = 7
        elif df_final[col].mean() < 1.0:
            precision = 5
        else:
            precision = 4
            
        df_final[col] = df_final[col].round(precision)
        
    # 物理清洗殘餘 NaN
    df_final = df_final.fillna(0)
        
    return df_final

def main():
    exporter = GitHubDataExporter()
    df_history = fetch_history_from_yfinance()
    
    if df_history is not None:
        recs = df_history.to_dict(orient='records')
        output_data = {
            "version": "2.2",
            "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "base": "TWD",
            "currencies": list(CURRENCY_MAP.keys()) + ["TWD_TWD"],
            "data": recs
        }
        
        target_path = os.path.join(exporter.base_path, "meta/exchange_rate_history.json")
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
            
        latest_date = df_history['date'].iloc[-1]
        print(f"✅ 匯率歷史重建完成: {target_path} (最新日期: {latest_date})")
        
        # 更新索引
        exporter.update_index("latest_exchange_rate", latest_date)
    else:
        print("❌ 無法取得任何匯率數據")

if __name__ == "__main__":
    main()
