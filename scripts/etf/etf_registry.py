import requests
import json
import os
import sys
from datetime import datetime

TWSE_ETF_API = "https://openapi.twse.com.tw/v1/opendata/t187ap47_L"
TPEX_ETF_API = "https://info.tpex.org.tw/api/etfFilter"
DATA_ROOT = os.environ.get("PUBLIC_DATA_ROOT", os.path.join(os.path.dirname(__file__), "..", "..", "data"))
CACHE_DIR = os.path.join(DATA_ROOT, "meta")
UNIVERSE_JSON = os.path.join(CACHE_DIR, "etf_universe.json")


def load_universe():
    """從 JSON cache 讀取 ETF universe，失败回傳空 dict"""
    try:
        with open(UNIVERSE_JSON, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ℹ️ [ETF Registry] 尚無持久化 universe，使用即時交易所清單初始化")
        return {"last_updated": None, "twse_count": 0, "tpex_count": 0, "etfs": {}}
    except Exception as e:
        print(f"⚠️ [ETF Registry] 讀取 cache 失敗: {e}")
        return {"last_updated": None, "twse_count": 0, "tpex_count": 0, "etfs": {}}


def save_universe(data):
    """將 ETF universe 寫入 JSON cache"""
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        data["last_updated"] = datetime.now().isoformat()
        with open(UNIVERSE_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"⚠️ [ETF Registry] 寫入 cache 失敗: {e}")
        return False


def fetch_twse_etf_list():
    """從 TWSE OpenAPI 取得所有上市 ETF 清單，回傳 {代號: info}"""
    try:
        resp = requests.get(TWSE_ETF_API, timeout=15, verify=False)
        resp.raise_for_status()
        data = resp.json()
        result = {}
        for item in data:
            code = item.get("基金代號", "")
            name = item.get("基金簡稱", "")
            fund_type = item.get("基金類型", "")
            if code and name:
                result[code] = {
                    "name": name,
                    "type": fund_type,
                    "exchange": "TWSE",
                }
        return result
    except Exception as e:
        print(f"⚠️ [ETF Registry] TWSE API 撈取失敗: {e}")
        return None


def fetch_tpex_etf_list():
    """從 TPEx API 取得所有上櫃 ETF 清單，回傳 {代號: info}"""
    try:
        resp = requests.post(TPEX_ETF_API, timeout=15, verify=False)
        resp.raise_for_status()
        data = resp.json()
        result = {}
        for item in data.get("data", []):
            code = item.get("stockNo", "")
            name = item.get("stockName", "")
            issuer = item.get("issuer", "")
            index_name = item.get("indexName", "")
            if code and name:
                result[code] = {
                    "name": name,
                    "type": index_name,
                    "exchange": "TPEX",
                    "issuer": issuer,
                }
        return result
    except Exception as e:
        print(f"⚠️ [ETF Registry] TPEx API 撈取失敗: {e}")
        return None


def classify_etf(fund_type, code):
    """根據基金類型與代號推斷 category 與 type"""
    code_upper = code.upper()

    if "主動" in fund_type:
        if code_upper.endswith("D"):
            return "active_bond", "active_bond"
        return "active", "active"

    if "槓桿" in fund_type or "反向" in fund_type:
        if "槓桿" in fund_type and "反向" in fund_type:
            pass
        elif "槓桿" in fund_type:
            return "leveraged", "futures"
        elif "反向" in fund_type:
            return "inverse", "futures"

    if "期貨" in fund_type or "指數股票型期貨" in fund_type:
        return "futures", "futures"

    if "債券" in fund_type or "固定收益" in fund_type or "公司債" in fund_type or "公債" in fund_type:
        return "bond", "bond"

    if "國外" in fund_type or "全球" in fund_type:
        return "overseas", "overseas"

    if "ESG" in fund_type:
        return "esg", "equity"

    return "index", "equity"


def diff_with_universe(live_etfs, cached_etfs):
    """比對即時爬取與快取，回傳 (new, removed)"""
    new_codes = set(live_etfs.keys()) - set(cached_etfs.keys())
    removed_codes = set(cached_etfs.keys()) - set(live_etfs.keys())
    return new_codes, removed_codes


def update_universe_with_live(live_twse, live_tpex, cached):
    """用即時資料更新 universe，保留舊有手動設定的欄位"""
    updated = cached.copy()
    updated_etfs = updated.get("etfs", {})

    all_live = {}
    if live_twse:
        all_live.update(live_twse)
    if live_tpex:
        all_live.update(live_tpex)

    new_codes, removed_codes = diff_with_universe(all_live, updated_etfs)

    for code in new_codes:
        info = all_live[code]
        cat, etype = classify_etf(info["type"], code)
        updated_etfs[code] = {
            "name": info["name"],
            "category": cat,
            "type": etype,
            "exchange": info.get("exchange", "unknown"),
            "tier": 2,
            "provider": "unknown",
            "data_mode": "full_holdings",
            "url": f"https://www.etfinfo.tw/etf/{code}/holdings",
        }

    for code in removed_codes:
        del updated_etfs[code]

    updated["etfs"] = updated_etfs
    updated["twse_count"] = len(live_twse) if live_twse else cached.get("twse_count", 0)
    updated["tpex_count"] = len(live_tpex) if live_tpex else cached.get("tpex_count", 0)

    return updated, new_codes, removed_codes


def print_report(new_codes, removed_codes, cached_count, live_count):
    """列印異動報告"""
    if not new_codes and not removed_codes:
        print(f"✅ [ETF Registry] 無異動（快取 {cached_count} 檔 vs 即時 {live_count} 檔）")
        return

    print(f"\n🔍 [ETF Registry] 偵測到異動：")
    if new_codes:
        print(f"   ➕ 新增 {len(new_codes)} 檔: {', '.join(sorted(new_codes))}")
    if removed_codes:
        print(f"   ➖ 下市 {len(removed_codes)} 檔: {', '.join(sorted(removed_codes))}")


def sync_universe():
    """
    主同步流程：
    1. 嘗試爬取 TWSE/TPEX
    2. 失敗 → fallback 至 JSON cache
    3. 成功 → 比對 + 更新 JSON
    """
    cached = load_universe()
    cached_etfs = cached.get("etfs", {})
    print(f"📡 [ETF Registry] 快取: {len(cached_etfs)} 檔 ETF")

    live_twse = fetch_twse_etf_list()
    live_tpex = fetch_tpex_etf_list()

    if live_twse is None and live_tpex is None:
        print("⚠️ [ETF Registry] TWSE + TPEX API 均失敗，fallback 使用快取 JSON")
        return cached_etfs

    live_count = (len(live_twse) if live_twse else 0) + (len(live_tpex) if live_tpex else 0)
    print(f"📡 [ETF Registry] 即時: TWSE {len(live_twse) if live_twse else 0} + TPEX {len(live_tpex) if live_tpex else 0} = {live_count} 檔")

    updated, new_codes, removed_codes = update_universe_with_live(live_twse, live_tpex, cached)
    print_report(new_codes, removed_codes, len(cached_etfs), live_count)

    if new_codes or removed_codes:
        save_universe(updated)
        print(f"💾 [ETF Registry] 已更新 {UNIVERSE_JSON}")
    else:
        print(f"⏭️ [ETF Registry] 無異動，跳過寫入")

    return updated.get("etfs", {})


def get_etf_sources():
    """供 sources.py 呼叫，回傳 ETF_SOURCES dict"""
    cached = load_universe()
    return cached.get("etfs", {})


if __name__ == "__main__":
    etfs = sync_universe()
    print(f"\n📊 最終結果: {len(etfs)} 檔 ETF")
