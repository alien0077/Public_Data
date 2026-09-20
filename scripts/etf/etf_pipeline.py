import os
import json
import pandas as pd
import random
import time
import requests
from datetime import datetime, timedelta
from sources import ETF_SOURCES
from resolver import ETFResolver
from etf_registry import sync_universe
from parsers.etfinfo_parser import ETFInfoParser
from parsers.moneydj_parser import MoneyDJParser
from parsers.bond_metrics_parser import BondMetricsParser

class ETFPipeline:
    def __init__(self):
        # 🚀 v9.1 Resolver Architecture
        self.project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
        self.resolver = ETFResolver()
        self.etfinfo_parser = ETFInfoParser()
        self.moneydj_parser = MoneyDJParser()
        self.bond_parser = BondMetricsParser()
        
        # 偵測環境
        if os.path.exists(os.path.join(self.project_root, "temp_repo")):
            self.base_data_path = os.path.join(self.project_root, "temp_repo/data")
            print(f"🏠 [ETF Pipeline] 偵測到 temp_repo，環境: LOCAL")
        else:
            self.base_data_path = os.path.join(self.project_root, "data")
            print(f"☁️ [ETF Pipeline] 環境: GITHUB ACTIONS")

        self.output_dir = os.path.join(self.base_data_path, "quant/etf/outputs")
        self.snapshot_dir = os.path.join(self.output_dir, "etf_timeseries")
        self.exposure_dir = os.path.join(self.output_dir, "stock_exposure")
        
        # 🚀 v9.5: 智慧日期辨識
        self.calendar_path = os.path.join(self.base_data_path, "meta/calendar.json")
        self.target_date, self.base_date = self.resolve_trading_days()
        print(f"📅 [ETF Pipeline] 目標日期: {self.target_date}, 基準日期: {self.base_date}")
        
        os.makedirs(self.snapshot_dir, exist_ok=True)
        os.makedirs(self.exposure_dir, exist_ok=True)

    def resolve_trading_days(self):
        """根據市場曆找出最後兩個交易日"""
        holidays = []
        if os.path.exists(self.calendar_path):
            with open(self.calendar_path, 'r', encoding='utf-8') as f:
                cal_data = json.load(f)
                year = datetime.now().strftime("%Y")
                holidays = cal_data.get("meta", {}).get("years", {}).get(year, {}).get("tw", [])
        
        def is_trading_day(dt):
            d_str = dt.strftime("%Y-%m-%d")
            return dt.weekday() < 5 and d_str not in holidays

        days = []
        check_dt = datetime.now()
        while len(days) < 2:
            if is_trading_day(check_dt):
                days.append(check_dt.strftime("%Y-%m-%d"))
            check_dt -= timedelta(days=1)
            if len(days) > 10: break
        return days[0], days[1]

    def check_etf_registry(self):
        """同步 TWSE/TPEX ETF 清單至 JSON cache，失败 fallback 使用快取"""
        global ETF_SOURCES
        etfs = sync_universe()
        if etfs:
            ETF_SOURCES = etfs

    def run(self):
        print(f"🚀 Starting ETF Pipeline V9.1 for {self.target_date} (Base: {self.base_date})")
        
        self.check_etf_registry()
        
        etf_data = self.fetch_all_etf_data()
        
        final_snapshot_path = os.path.join(self.snapshot_dir, f"{self.target_date}.json")
        with open(final_snapshot_path, 'w', encoding='utf-8') as f:
            json.dump(etf_data, f, indent=2, ensure_ascii=False)

        # 3. Generate Analytical Outputs (Diffing against EXISTING latest_snapshot.json)
        # 強制加載基準日的歷史數據作為比對對象
        base_path = os.path.join(self.snapshot_dir, f"{self.base_date}.json")
        faked_base_data = None
        if os.path.exists(base_path):
            print(f"📊 [ETF Pipeline] 採用歷史交易日 {self.base_date} 作為比對基準")
            with open(base_path, 'r', encoding='utf-8') as f:
                faked_base_data = json.load(f)

        self.generate_exposure(etf_data)
        self.generate_rebalance(etf_data, base_override=faked_base_data)
        self.generate_rotation(etf_data, base_override=faked_base_data)
        self.generate_category_summary(etf_data)
        self.generate_etf_flow(etf_data, base_override=faked_base_data)
        self.generate_etf_year_performance(etf_data)
        
        # 4. Update Latest Snapshot (Save for tomorrow's diff)
        with open(os.path.join(self.output_dir, "latest_snapshot.json"), 'w', encoding='utf-8') as f:
            json.dump(etf_data, f, indent=2, ensure_ascii=False)
        
        print("✅ ETF Pipeline Completed")

    def fetch_all_etf_data(self):
        data = {}
        print(f"📡 Resolving data for {len(ETF_SOURCES)} ETFs...")
        
        for i, (etf_id, info) in enumerate(ETF_SOURCES.items()):
            print(f"[{i+1}/{len(ETF_SOURCES)}] Processing {etf_id} ({info['name']})...", end="\r")
            
            # Get candidate sources from resolver
            sources = self.resolver.resolve(etf_id, info)
            holdings = []
            metrics = {}
            found = False
            
            # Waterfall strategy
            for source_name, url, source_type in sources:
                try:
                    if source_type == "holdings" and not holdings:
                        if source_name == "etfinfo":
                            holdings = self.etfinfo_parser.fetch_holdings(etf_id)
                        elif source_name == "moneydj":
                            holdings = self.moneydj_parser.fetch_holdings(etf_id)
                    
                    elif source_type == "metrics" and not metrics:
                        # Fetch and parse metrics
                        resp = requests.get(url, timeout=10, verify=False)
                        if resp.status_code == 200:
                            if "moneydj" in source_name:
                                resp.encoding = resp.apparent_encoding
                            m = self.bond_parser.parse_from_html(resp.text)
                            if m: metrics.update(m)
                except Exception as e:
                    continue
            
            if holdings or metrics: found = True
            
            # Final fallback if all sources fail
            if not found:
                holdings = self.get_fallback_holdings(etf_id, info)
            
            res = {
                "name": info["name"],
                "category": info["category"],
                "type": info["type"],
                "tier": info["tier"],
                "data_mode": info["data_mode"],
                "holdings": holdings
            }
            if metrics:
                res["metrics"] = metrics
            
            data[etf_id] = res
            
            # Rate limiting
            if i % 5 == 0: time.sleep(1)

        print(f"\n✅ Data collection complete.")
        return data

    def get_fallback_holdings(self, etf_id, info):
        # 🚀 v9.1: 嘗試從最新的本地快照讀取
        latest_path = os.path.join(self.output_dir, "latest_snapshot.json")
        if os.path.exists(latest_path):
            with open(latest_path, 'r', encoding='utf-8') as f:
                full_data = json.load(f)
                if etf_id in full_data:
                    return full_data[etf_id].get("holdings", [])
        return []

    def generate_exposure(self, etf_data):
        # 🚀 v9.1: 產出個股被 ETF 持有的曝險清單
        exposure = {}
        for etf_id, data in etf_data.items():
            for h in data["holdings"]:
                sid = h["stock_id"]
                if sid not in exposure:
                    exposure[sid] = {"etf_count": 0, "total_weight": 0, "categories": {}, "etfs": []}
                
                exposure[sid]["etf_count"] += 1
                exposure[sid]["total_weight"] += h["weight"]
                cat = data["category"]
                exposure[sid]["categories"][cat] = exposure[sid]["categories"].get(cat, 0) + h["weight"]
                exposure[sid]["etfs"].append({"id": etf_id, "name": data["name"], "weight": h["weight"]})
        
        with open(os.path.join(self.output_dir, "stock_exposure.json"), 'w', encoding='utf-8') as f:
            json.dump(exposure, f, indent=2, ensure_ascii=False)

    def generate_rebalance(self, etf_data, base_override=None):
        # 🚀 v9.2: 偵測成分股異動 (Add/Remove/Weight)
        old_data = base_override
        if not old_data:
            latest_path = os.path.join(self.output_dir, "latest_snapshot.json")
            if not os.path.exists(latest_path): return
            with open(latest_path, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
            
        rebalance_results = {}
        for etf_id, new_info in etf_data.items():
            if etf_id not in old_data: continue
            old_holdings = {h["stock_id"]: h["weight"] for h in old_data[etf_id].get("holdings", [])}
            new_holdings = {h["stock_id"]: h["weight"] for h in new_info.get("holdings", [])}
            added = [sid for sid in new_holdings if sid not in old_holdings]
            removed = [sid for sid in old_holdings if sid not in new_holdings]
            weight_up = []
            weight_down = []
            for sid, new_w in new_holdings.items():
                if sid in old_holdings:
                    diff = new_w - old_holdings[sid]
                    if diff > 0.5: weight_up.append({"stock_id": sid, "diff": round(diff, 2)})
                    elif diff < -0.5: weight_down.append({"stock_id": sid, "diff": round(diff, 2)})
            
            if added or removed or weight_up or weight_down:
                rebalance_results[etf_id] = {
                    "name": new_info["name"],
                    "added": added,
                    "removed": removed,
                    "weight_up": weight_up,
                    "weight_down": weight_down
                }
        
        with open(os.path.join(self.output_dir, "rebalance.json"), 'w', encoding='utf-8') as f:
            json.dump(rebalance_results, f, indent=2, ensure_ascii=False)

    def generate_rotation(self, etf_data, base_override=None):
        """
        🚀 v9.3: 實作主題輪動分析 (Rotation Engine)
        保持 Key 為英文標籤，讓 App 處理翻譯
        """
        old_data = base_override
        if not old_data:
            latest_path = os.path.join(self.output_dir, "latest_snapshot.json")
            if not os.path.exists(latest_path): return
            with open(latest_path, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
            
        rotation_results = {}
        cat_diffs = {}
        cat_inflows = {}
        
        for etf_id, new_info in etf_data.items():
            if etf_id not in old_data: continue
            cat = new_info["category"]
            if cat not in cat_diffs: 
                cat_diffs[cat] = []
                cat_inflows[cat] = {}
            
            old_h = {h["stock_id"]: h["weight"] for h in old_data[etf_id].get("holdings", [])}
            new_h = {h["stock_id"]: h["weight"] for h in new_info.get("holdings", [])}
            
            diffs = []
            for sid, new_w in new_h.items():
                diff = new_w - old_h.get(sid, 0)
                diffs.append(diff)
                if diff > 0.3 and sid != "CASH":
                    cat_inflows[cat][sid] = cat_inflows[cat].get(sid, 0) + diff
            
            if diffs:
                cat_diffs[cat].append(sum(diffs) / len(diffs))
        
        for cat, diff_list in cat_diffs.items():
            avg_change = sum(diff_list) / len(diff_list) if diff_list else 0
            sorted_inflows = sorted(cat_inflows.get(cat, {}).items(), key=lambda x: x[1], reverse=True)
            top_stocks = [x[0] for x in sorted_inflows[:5]]
            
            rotation_results[cat] = {
                "avg_weight_change": round(float(avg_change), 4),
                "etf_count": len(diff_list),
                "top_inflow": top_stocks
            }
            
        with open(os.path.join(self.output_dir, "rotation.json"), 'w', encoding='utf-8') as f:
            json.dump(rotation_results, f, indent=2, ensure_ascii=False)

    def generate_category_summary(self, etf_data):
        summary = {}
        for etf_id, data in etf_data.items():
            cat = data["category"]
            if cat not in summary:
                summary[cat] = {"count": 0, "etfs": []}
            summary[cat]["count"] += 1
            summary[cat]["etfs"].append(etf_id)
        
        with open(os.path.join(self.output_dir, "category_summary.json"), 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)

    def generate_etf_flow(self, etf_data, base_override=None):
        old_data = base_override
        if not old_data:
            latest_path = os.path.join(self.output_dir, "latest_snapshot.json")
            if not os.path.exists(latest_path): return
            with open(latest_path, 'r', encoding='utf-8') as f:
                old_data = json.load(f)

        # 🚀 建立 stock_id -> stock_name 對照表 (從所有 ETF holdings 中提取)
        stock_name_map = {}
        for info in etf_data.values():
            for h in info.get("holdings", []):
                sid = h.get("stock_id", "")
                name = h.get("stock_name", "")
                if sid and name and sid not in stock_name_map:
                    stock_name_map[sid] = name

        stock_flow = {}
        for etf_id, new_info in etf_data.items():
            if etf_id not in old_data: continue
            old_h = {h["stock_id"]: h["weight"] for h in old_data[etf_id].get("holdings", [])}
            new_h = {h["stock_id"]: h["weight"] for h in new_info.get("holdings", [])}
            all_stocks = set(old_h.keys()) | set(new_h.keys())
            for sid in all_stocks:
                if sid == "CASH" or sid.startswith("C_") or len(sid) > 6: continue
                if not sid[:1].isdigit(): continue
                diff = new_h.get(sid, 0) - old_h.get(sid, 0)
                if abs(diff) < 0.01: continue
                if sid not in stock_flow:
                    stock_flow[sid] = {"net_flow": 0, "etf_count": 0, "details": []}
                stock_flow[sid]["net_flow"] += diff
                stock_flow[sid]["etf_count"] += 1
                if abs(diff) > 0.01:
                    stock_flow[sid]["details"].append({
                        "etf_id": etf_id,
                        "etf_name": new_info["name"],
                        "diff": round(diff, 4)
                    })

        sorted_stocks = sorted(stock_flow.items(), key=lambda x: x[1]["net_flow"], reverse=True)
        top_buy = [{"stock_id": sid, "stock_name": stock_name_map.get(sid, ""), **info} for sid, info in sorted_stocks[:20]]
        top_sell = [{"stock_id": sid, "stock_name": stock_name_map.get(sid, ""), **info} for sid, info in sorted_stocks[-20:][::-1]]

        result = {
            "date": self.target_date,
            "base_date": self.base_date,
            "top_buy": top_buy,
            "top_sell": top_sell
        }
        with open(os.path.join(self.output_dir, "etf_flow.json"), 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

    def generate_etf_year_performance(self, etf_data):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__))))
        from github_utils import GitHubDataExporter
        exporter = GitHubDataExporter()
        daily_dir = os.path.join(exporter.base_path, "daily", "tw")
        if not os.path.isdir(daily_dir):
            print("⚠️ daily/tw 目錄不存在，跳过年績效")
            return

        daily_files = sorted([f for f in os.listdir(daily_dir) if f.endswith('.json')])
        year = datetime.now().year
        year_files = [f for f in daily_files if f.startswith(f"{year}-")]
        if len(year_files) < 2:
            print(f"⚠️ {year} 年交易日不足 ({len(year_files)} 筆)，跳过年績效")
            return

        # Load corporate actions and compute dynamic adj_c (same as iOS AdjustmentEngine)
        # Reuse the public golden daily compatibility implementation. Do not depend
        # on the private TWStockTracker daily_tw_job module.
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from build_daily_tw_compat import load_corporate_actions, apply_adjustments_to_df
        import pandas as pd
        all_actions = load_corporate_actions()

        first_file = os.path.join(daily_dir, year_files[0])
        latest_file = os.path.join(daily_dir, year_files[-1])
        first_day = json.load(open(first_file))
        latest_day = json.load(open(latest_file))

        first_stocks = {s['id']: s for s in first_day.get('stocks', []) if isinstance(s, dict)}
        latest_stocks = {s['id']: s for s in latest_day.get('stocks', []) if isinstance(s, dict)}

        # Use the same persistent public universe as etf_registry; keep a
        # defined fallback so year-performance never depends on an ephemeral
        # scripts/etf/cache path.
        from etf_registry import load_universe
        universe = load_universe().get("etfs", {})
        etf_ids = list(latest_stocks.keys())
        if universe:
            etf_ids = [eid for eid in universe.keys() if eid in latest_stocks]

        rows = []
        for etf_id in etf_ids:
            first = first_stocks.get(etf_id)
            latest = latest_stocks.get(etf_id)
            if first and latest:
                rows.append({"id": etf_id, "date": year_files[0].replace('.json',''), "c": float(first.get('c', 0))})
                rows.append({"id": etf_id, "date": year_files[-1].replace('.json',''), "c": float(latest.get('c', 0))})
        if not rows: return

        df = pd.DataFrame(rows)
        df = apply_adjustments_to_df(df, all_actions)

        results = []
        for etf_id in etf_ids:
            etf_df = df[df['id'] == etf_id].sort_values('date')
            if len(etf_df) < 2: continue
            first_raw_close = float(etf_df.iloc[0]['c'])
            last_raw_close = float(etf_df.iloc[1]['c'])
            first_adjusted_close = float(etf_df.iloc[0]['adj_c'])
            last_adjusted_close = float(etf_df.iloc[1]['adj_c'])
            if min(first_raw_close, last_raw_close, first_adjusted_close, last_adjusted_close) <= 0: continue
            # 報酬用還原價以包含股利／分割效果；畫面上的起始／最新價仍是 raw close。
            ret = (last_adjusted_close - first_adjusted_close) / first_adjusted_close * 100
            info = universe.get(etf_id, etf_data.get(etf_id, {}))
            results.append({
                "etf_id": etf_id,
                "etf_name": info.get("name", etf_id),
                "category": info.get("category", ""),
                "first_date": year_files[0].replace('.json', ''),
                "latest_date": year_files[-1].replace('.json', ''),
                "first_close": round(first_raw_close, 2),
                "latest_close": round(last_raw_close, 2),
                "return_pct": round(ret, 2),
                "return_price_basis": "adjusted_close",
                "display_price_basis": "raw_close",
            })

        results.sort(key=lambda x: x["return_pct"], reverse=True)
        output = {
            "date": self.target_date,
            "year": year,
            "etfs": results
        }
        with open(os.path.join(self.output_dir, "etf_year_performance.json"), 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"📊 ETF 年績效: {len(results)} ETFs (dynamic adj_c from corporate actions)")

if __name__ == "__main__":
    pipeline = ETFPipeline()
    pipeline.run()
