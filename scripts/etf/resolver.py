# resolver.py
import sys
import os
from providers import ETF_PROVIDERS

class ETFResolver:
    """
    動態解析 ETF 的數據來源 URL。
    根據 ETF 的類型與發行商，提供優先順序排列的候選 URL。
    """

    def resolve(self, etf_id, info):
        """
        返回一個列表，包含 (source_name, url, source_type)
        source_type: 'holdings' 或 'metrics'
        """
        sources = []
        
        # 1. Holdings Sources
        sources.append(("etfinfo", f"https://www.etfinfo.tw/etf/{etf_id}/holdings", "holdings"))
        sources.append(("moneydj", f"https://www.moneydj.com/etf/x/basic/basic0007.xdjhtm?etfid={etf_id}.TW", "holdings"))
        
        # 2. Metrics Sources (對於債券 ETF 特別重要)
        if info.get("type") == "bond":
            sources.append(("moneydj_basic", f"https://www.moneydj.com/etf/x/basic/basic0002.xdjhtm?etfid={etf_id}.TW", "metrics"))
        
        # 3. Provider Fallback
        provider_key = info.get("provider")
        if provider_key in ETF_PROVIDERS:
            provider_cfg = ETF_PROVIDERS[provider_key]
            base_url = provider_cfg.get("base_url")
            if base_url:
                sources.append(("provider", base_url.format(etf_id=etf_id), "metrics"))

        return sources

    def get_preferred_mode(self, info):
        """
        根據數據模式決定解析策略
        """
        return info.get("data_mode", "full_holdings")
