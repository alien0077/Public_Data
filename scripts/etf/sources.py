# sources.py
# 台股 ETF Universe（量化系統版）
# 從 cache/etf_universe.json 讀取，由 etf_registry.py 自動維護

import os
import json

_CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
_UNIVERSE_JSON = os.path.join(_CACHE_DIR, "etf_universe.json")

def _load_etf_sources():
    """從 JSON cache 讀取 ETF_SOURCES，失败回傳空 dict"""
    try:
        with open(_UNIVERSE_JSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get("etfs", {})
    except Exception:
        return {}

ETF_SOURCES = _load_etf_sources()
