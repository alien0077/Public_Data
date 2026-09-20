import os
import json
import pandas as pd
import requests
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

class GitHubDataExporter:
    def __init__(self, user="alien0077", repo="Public_Data", base_data_path="data"):
        self.user = user
        self.repo = repo
        
        # 🚀 v2.2.1: 使用 __file__ 定位專案根目錄，避免相對路徑因 cwd 不同而錯誤
        _script_dir = os.path.dirname(os.path.abspath(__file__))
        _project_root = os.path.dirname(_script_dir)
        
        # 若存在 temp_repo 且裡面有資料，則視為本地開發環境，路徑對準 temp_repo/data
        _temp_repo_data = os.path.join(_project_root, "temp_repo", base_data_path)
        if os.path.exists(_temp_repo_data):
            self.is_local_mode = True
            self.base_path = _temp_repo_data
            print(f"🏠 [Mode: LOCAL] 偵測到 temp_repo，路徑重導向至: {self.base_path}")
        else:
            self.is_local_mode = False
            self.base_path = os.path.join(_project_root, base_data_path)
            print(f"☁️ [Mode: CLOUD] 輸出路徑設為: {self.base_path}")
            
    def export_to_json(self, df, folder, filename, meta=None):
        if not os.path.exists(self.base_path):
            os.makedirs(self.base_path, exist_ok=True)

        target_dir = os.path.join(self.base_path, folder)
        os.makedirs(target_dir, exist_ok=True)
        
        import numpy as np
        # 🚀 物理層處理 NaN。確保所有產出的 JSON 都不含非法 NaN (Swift 解析器會崩潰)
        df_clean = df.replace({np.nan: None}).replace({float('nan'): None})
            
        data_list = df_clean.to_dict(orient='records')
        now_tpe = datetime.now(ZoneInfo("Asia/Taipei"))
        output = {
            "version": "1.0",
            "updated_at": now_tpe.isoformat(),
            "stocks": data_list,
            "data": data_list 
        }
        if meta: output["meta"] = meta
        
        file_path = os.path.join(target_dir, f"{filename}.json")
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"📦 已產出 JSON: {file_path} ({len(df)} 筆)")

    def update_index(self, key, value, force_resync=False):
        """ 🎯 增量更新索引 (支援 Local/Cloud 自適應) """
        index_path = os.path.join(self.base_path, "index.json")
        remote_index = {}
        
        # 1. 獲取基礎索引
        if self.is_local_mode:
            if os.path.exists(index_path):
                with open(index_path, 'r', encoding='utf-8') as f:
                    remote_index = json.load(f)
        else:
            current_remote = self.get_remote_index()
            if current_remote: remote_index = current_remote
            elif os.path.exists(index_path):
                with open(index_path, 'r', encoding='utf-8') as f:
                    remote_index = json.load(f)
        
        # 2. 更新指定的主鍵 (🚀 安全保護：若為 latest_*，僅當新值較大時更新)
        if key.startswith("latest_"):
            old_value = remote_index.get(key, "")
            if value >= old_value:
                remote_index[key] = value
        else:
            remote_index[key] = value
        
        # 3. 重新掃描清單 (本地模式下全量掃描以確保對位，雲端模式下採增量合併)
        def scan_list(key_name, sub_folder, filter_pattern=None):
            full_path = os.path.join(self.base_path, sub_folder)
            if not os.path.exists(full_path): return []
            local_files = sorted([f.replace('.json', '') for f in os.listdir(full_path) if f.endswith('.json')])
            
            if filter_pattern:
                import re
                local_files = [f for f in local_files if re.match(filter_pattern, f)]
            
            if self.is_local_mode or force_resync:
                return local_files
            else:
                existing_list = remote_index.get(key_name, [])
                if not isinstance(existing_list, list): existing_list = []
                return sorted(list(set(existing_list) | set(local_files)))

        remote_index["available_months"] = scan_list("available_months", "monthly", r'^\d{4}-\d{2}$')
        remote_index["available_quarters"] = scan_list("available_quarters", "quarterly", r'^\d{4}-Q[1-4]$')
        remote_index["available_weeks"] = scan_list("available_weeks", "weekly", r'^\d{4}-W\d{2}$')
        remote_index["available_days_tw"] = scan_list("available_days_tw", "daily/tw")
        remote_index["available_days_tw_indices"] = scan_list("available_days_tw_indices", "daily/tw_indices")
        remote_index["available_days_tw_market_margin"] = scan_list("available_days_tw_market_margin", "daily/tw_market_margin")
        remote_index["available_days_us"] = scan_list("available_days_us", "daily/us")
        
        # 🚀 v9.2: Market Structure Scan
        # 由於結構是依 symbol 存放的，我們掃描結構目錄下的所有 JSON 檔
        structure_path = os.path.join(self.base_path, "structure", "daily")
        if os.path.exists(structure_path):
            remote_index["available_structure_symbols"] = sorted([f.replace('.json', '') for f in os.listdir(structure_path) if f.endswith('.json')])
            # 獲取最新更新時間
            latest_file = ""
            latest_time = 0
            for f in os.listdir(structure_path):
                if f.endswith('.json'):
                    t = os.path.getmtime(os.path.join(structure_path, f))
                    if t > latest_time:
                        latest_time = t
                        latest_file = f
            if latest_file:
                # 簡單起見，用今天的日期
                remote_index["latest_structure_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")

        # 🚀 v9.0: ETF Intelligence Scan
        remote_index["available_etf_days"] = scan_list("available_etf_days", "quant/etf/outputs/etf_timeseries")
        if remote_index["available_etf_days"]:
            remote_index["latest_etf_update"] = remote_index["available_etf_days"][-1]

        # 🚀 v9.3: AI Health Scan
        # 掃描 stocks 目錄下的個股健檢數據
        health_path = os.path.join(self.base_path, "stocks")
        if os.path.exists(health_path):
            remote_index["available_health_symbols"] = sorted([f.replace('.json', '') for f in os.listdir(health_path) if f.endswith('.json')])
            # 獲取最新更新時間 (採用當天日期作為標記)
            remote_index["latest_ai_health_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")

        # 4. 同步最新日期標記
        if remote_index["available_days_tw"]: remote_index["latest_daily_tw"] = remote_index["available_days_tw"][-1]
        if remote_index["available_days_tw_indices"]: remote_index["latest_daily_tw_indices"] = remote_index["available_days_tw_indices"][-1]
        if remote_index["available_days_tw_market_margin"]: remote_index["latest_daily_tw_market_margin"] = remote_index["available_days_tw_market_margin"][-1]
        if remote_index["available_days_us"]: remote_index["latest_daily_us"] = remote_index["available_days_us"][-1]

        if remote_index["available_months"]: remote_index["latest_monthly"] = remote_index["available_months"][-1]
        if remote_index["available_weeks"]: remote_index["latest_weekly"] = remote_index["available_weeks"][-1]
        if remote_index["available_quarters"]: remote_index["latest_quarterly"] = remote_index["available_quarters"][-1]

        # 🚀 v2.2.1: 追蹤 Quant 系統更新時間 (精確讀取檔案日期)
        quant_path = os.path.join(self.base_path, "quant", "latest_portfolio.json")
        if os.path.exists(quant_path):
            try:
                with open(quant_path, 'r', encoding='utf-8') as f:
                    q_data = json.load(f)
                    if "date" in q_data:
                        remote_index["latest_quant_update"] = q_data["date"]
                    else:
                        remote_index["latest_quant_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
            except:
                remote_index["latest_quant_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")

        # 🚀 v10.7: Institutional Tracking Scan
        inst_path = os.path.join(self.base_path, "quant",
                                 "institutional_leaderboard.json")
        if os.path.exists(inst_path):
            try:
                with open(inst_path, 'r', encoding='utf-8') as f:
                    inst_data = json.load(f)
                    if "date" in inst_data:
                        remote_index["latest_institutional_tracking"] = \
                            inst_data["date"]
            except Exception:
                pass

        # 🚀 v10.6: Liar System Scan
        liar_file_path = os.path.join(self.base_path, "daily", "liar.json")
        if os.path.exists(liar_file_path):
            try:
                with open(liar_file_path, 'r', encoding='utf-8') as f:
                    liar_data = json.load(f)
                    if "updatedAt" in liar_data:
                        remote_index["latest_liar_update"] = liar_data["updatedAt"][:10]
                    else:
                        remote_index["latest_liar_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
            except:
                remote_index["latest_liar_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
        
        # 🚀 v10.11: AI Intelligence Scan
        # 🚀 v10.13: market_risk — 從檔案內部讀取 date，而非僅在缺失時設今日
        mr_path = os.path.join(self.base_path, "meta", "market_risk.json")
        if os.path.exists(mr_path):
            try:
                with open(mr_path, 'r', encoding='utf-8') as f:
                    mr_data = json.load(f)
                    # market_risk.json 可能是 {"stocks": [...]} 或 {"date": ...} 格式
                    mr_date = None
                    if "date" in mr_data:
                        mr_date = mr_data["date"]
                    elif "stocks" in mr_data and isinstance(mr_data["stocks"], list) and mr_data["stocks"]:
                        mr_date = mr_data["stocks"][0].get("date")
                    if mr_date:
                        remote_index["latest_market_risk_update"] = mr_date
                    else:
                        remote_index["latest_market_risk_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
            except Exception:
                remote_index["latest_market_risk_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")

        if os.path.exists(os.path.join(self.base_path, "meta", "market_narrative.json")):
             if "latest_market_narrative_update" not in remote_index:
                 remote_index["latest_market_narrative_update"] = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")

        # 🚀 v10.10: Rapid Screen Scan — 從 rapid_screen.json 讀取 date
        rapid_path = os.path.join(self.base_path, "quant", "rapid_screen.json")
        if os.path.exists(rapid_path):
            try:
                with open(rapid_path, 'r', encoding='utf-8') as f:
                    rs_data = json.load(f)
                    if "date" in rs_data:
                        remote_index["latest_rapid_screen"] = rs_data["date"]
            except Exception:
                pass

        # 🚀 v10.10: Sector PE Scan — 從 sector_pe.json 讀取 date
        sector_pe_path = os.path.join(self.base_path, "quant", "sector_pe.json")
        if os.path.exists(sector_pe_path):
            try:
                with open(sector_pe_path, 'r', encoding='utf-8') as f:
                    sp_data = json.load(f)
                    if "date" in sp_data:
                        remote_index["latest_sector_pe"] = sp_data["date"]
            except Exception:
                pass

        # 🚀 v10.10: PE Ratio Scan — 從 pe_ratio.json 讀取 date
        pe_ratio_path = os.path.join(self.base_path, "quant", "pe_ratio.json")
        if os.path.exists(pe_ratio_path):
            try:
                with open(pe_ratio_path, 'r', encoding='utf-8') as f:
                    pe_data = json.load(f)
                    if "date" in pe_data:
                        remote_index["latest_pe_ratio"] = pe_data["date"]
            except Exception:
                pass

        # v1.0: latest-only unified stock metrics snapshot
        metrics_path = os.path.join(self.base_path, "metrics", "stock_metrics.json")
        if os.path.exists(metrics_path):
            try:
                with open(metrics_path, 'r', encoding='utf-8') as f:
                    metrics_data = json.load(f)
                metric_date = metrics_data.get("as_of") or metrics_data.get("price_date")
                if metric_date:
                    remote_index["latest_stock_metrics"] = metric_date
            except Exception:
                pass

        # 🚀 v2.13: Sector Monthly Flow Scan — 掃描 quant/sector_monthly_flow/ 目錄
        smf_path = os.path.join(self.base_path, "quant", "sector_monthly_flow")
        if os.path.exists(smf_path):
            smf_files = sorted([f.replace('.json', '') for f in os.listdir(smf_path)
                                if f.endswith('.json') and f != 'index.json'])
            remote_index["available_sector_monthly_themes"] = smf_files
            if smf_files:
                smf_index_path = os.path.join(smf_path, "index.json")
                smf_date = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d")
                if os.path.exists(smf_index_path):
                    try:
                        with open(smf_index_path, 'r', encoding='utf-8') as f:
                            smf_index = json.load(f)
                            if "date" in smf_index and smf_index["date"]:
                                smf_date = smf_index["date"]
                    except Exception:
                        pass
                remote_index["latest_sector_monthly_flow"] = smf_date

        # 5. 掃描除權息年份
        action_path = os.path.join(self.base_path, "meta", "actions")
        if os.path.exists(action_path):
            remote_index["available_action_years"] = sorted([
                int(f.replace('.json', '')) for f in os.listdir(action_path)
                if f.endswith('.json') and f.replace('.json', '').isdigit()
            ])
        
        # 🚀 Audio Summaries Scan (財經影音 AI 摘要)
        audio_path = os.path.join(self.base_path, "audio_summaries", "show_summaries.json")
        if os.path.exists(audio_path):
            try:
                with open(audio_path, 'r', encoding='utf-8') as f:
                    audio_data = json.load(f)
                remote_index["latest_audio_summary_update"] = audio_data.get("last_updated", "")
                remote_index["audio_summary_episode_count"] = len(audio_data.get("episodes", []))
            except Exception:
                pass

        # v1.0: Macro dashboard/index contract.  Index records the published
        # dashboard timestamp and formula version; clients fetch dashboard.json
        # as one cloud payload and do not recompute factors locally.
        macro_root = os.path.join(self.base_path, "macro")
        macro_dashboard_path = os.path.join(macro_root, "dashboard.json")
        if os.path.exists(macro_dashboard_path):
            try:
                with open(macro_dashboard_path, 'r', encoding='utf-8') as f:
                    macro_dashboard = json.load(f)
                macro_as_of = macro_dashboard.get("as_of")
                if macro_as_of:
                    remote_index["latest_macro_update"] = macro_as_of
                macro_version = macro_dashboard.get("formula_version") or macro_dashboard.get("schema_version")
                if macro_version:
                    remote_index["latest_macro_factor_version"] = macro_version
            except Exception:
                pass
        macro_series_root = os.path.join(macro_root, "raw")
        if os.path.exists(macro_series_root):
            series_ids = set()
            for root, _, files in os.walk(macro_series_root):
                for filename in files:
                    if not filename.endswith(".json"):
                        continue
                    try:
                        with open(os.path.join(root, filename), 'r', encoding='utf-8') as f:
                            payload = json.load(f)
                        records = payload if isinstance(payload, list) else payload.get("records", []) if isinstance(payload, dict) else []
                        series_ids.update(record.get("series_id") for record in records if isinstance(record, dict) and record.get("series_id"))
                    except (OSError, json.JSONDecodeError):
                        continue
            remote_index["available_macro_series"] = sorted(series_ids)

        # 🚀 設定 updated_at 時間戳，讓 iOS App 的 isCloudIndexNewer 判斷能正確觸發
        remote_index["updated_at"] = datetime.now(ZoneInfo("Asia/Taipei")).isoformat()

        # 🚀 v2.2.2: 強制建立目錄，防止 FileNotFoundError
        os.makedirs(os.path.dirname(index_path), exist_ok=True)
        
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(remote_index, f, ensure_ascii=False, indent=2)
        
        print(f"📍 索引更新成功 (環境: {'Local' if self.is_local_mode else 'Cloud'})")

    def check_remote_exists(self, folder, filename):
        # 🚀 v2.3.0: 優先檢查本地檔案 (適用於 GitHub Actions 已 Pre-load 歷史數據的場景)
        local_path = os.path.join(self.base_path, folder, f"{filename}.json")
        if os.path.exists(local_path):
            return True
            
        # 若本地沒有，且非本地開發模式，才去查詢雲端 (防止 Pages 部署延遲)
        if not self.is_local_mode:
            url = f"https://{self.user}.github.io/{self.repo}/data/{folder}/{filename}.json"
            try:
                r = requests.head(url, timeout=5)
                return r.status_code == 200
            except: return False
        return False

    def get_remote_index(self):
        url = f"https://{self.user}.github.io/{self.repo}/data/index.json"
        try:
            r = requests.get(url, timeout=10)
            if r.status_code == 200: return r.json()
        except: pass
        return {}
