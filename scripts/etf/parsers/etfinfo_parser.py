import requests
import re
import json

class ETFInfoParser:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def fetch_holdings(self, etf_id):
        url = f"https://www.etfinfo.tw/etf/{etf_id}/holdings"
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            if response.status_code == 404:
                print(f"⚠️ ETF {etf_id} not found on etfinfo.tw (404)")
                return []
            if response.status_code != 200:
                print(f"⚠️ Failed to fetch {etf_id}: Status {response.status_code}")
                return []

            # 🚀 v9.6: Robust Nuxt 3 State Parser
            match = re.search(r'<script type="application/json" id="__NUXT_DATA__"[^>]*>(.*?)</script>', response.text)
            if not match:
                match = re.search(r'<script type="application/json" data-nuxt-data="nuxt-app"[^>]*>(.*?)</script>', response.text)
            
            if not match:
                # Fallback to regex if Nuxt script not found
                return self._fallback_regex_parse(response.text, etf_id)

            data = json.loads(match.group(1))
            
            def resolve(val):
                if isinstance(val, int) and 0 <= val < len(data):
                    return data[val]
                return val

            holdings = []
            for item in data:
                # Nuxt 3 flat array often has objects with indices pointing to values
                if isinstance(item, dict) and 'code' in item and 'weight' in item:
                    sid = resolve(item['code'])
                    name = resolve(item.get('name', ''))
                    weight = resolve(item['weight'])
                    
                    if isinstance(sid, str) and isinstance(weight, (int, float)):
                        # Filter criteria
                        if len(sid) < 2: continue
                        if sid == etf_id: continue
                        # Filter date-like strings (YYYY-MM-DD is 10 chars)
                        if len(sid) == 10 and sid[4] == '-' and sid[7] == '-': continue
                        
                        if weight <= 0: continue
                        
                        # Cleanup
                        name = str(name).replace("*", "").strip()
                        if " " in sid:
                            sid = sid.split(" ")[0]

                        holdings.append({
                            "stock_id": sid,
                            "stock_name": name,
                            "weight": float(weight)
                        })
            
            # Sort and de-duplicate
            seen_ids = set()
            unique_holdings = []
            for h in sorted(holdings, key=lambda x: x["weight"], reverse=True):
                if h["stock_id"] not in seen_ids:
                    unique_holdings.append(h)
                    seen_ids.add(h["stock_id"])
            
            return unique_holdings

        except Exception as e:
            print(f"❌ Error parsing {etf_id}: {e}")
            return []

    def _fallback_regex_parse(self, html, etf_id):
        # Legacy regex for simple cases or if Nuxt parsing fails
        matches = re.findall(r'"([^"]+)","([^"]+)",(\d+\.\d+)', html)
        holdings = []
        for sid, name, weight in matches:
            weight = float(weight)
            if sid == etf_id or len(sid) < 2 or weight <= 0: continue
            holdings.append({"stock_id": sid, "stock_name": name.replace("*","").strip(), "weight": weight})
        return holdings

if __name__ == "__main__":
    parser = ETFInfoParser()
    for eid in ["0050", "00631L", "00646"]:
        res = parser.fetch_holdings(eid)
        print(f"{eid}: Found {len(res)} holdings")
        for h in res[:3]: print(h)
