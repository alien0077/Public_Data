import requests
from bs4 import BeautifulSoup
import urllib3
import re

# Suppress SSL warnings for MoneyDJ
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class MoneyDJParser:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def fetch_holdings(self, etf_id):
        # Ensure .TW suffix for Taiwan ETFs as expected by MoneyDJ
        ticker = etf_id if "." in etf_id else f"{etf_id}.TW"
        url = f"https://www.moneydj.com/etf/x/basic/basic0007.xdjhtm?etfid={ticker}"
        
        try:
            response = requests.get(url, headers=self.headers, verify=False, timeout=15)
            if response.status_code != 200:
                print(f"⚠️ Failed to fetch MoneyDJ for {etf_id}: Status {response.status_code}")
                return []
            
            # MoneyDJ typically uses Big5
            if 'charset=big5' in response.text.lower():
                response.encoding = 'big5'
            else:
                response.encoding = 'utf-8'

            soup = BeautifulSoup(response.text, "html.parser")
            tables = soup.find_all("table")
            
            holdings = []
            for table in tables:
                rows = table.find_all("tr")
                if not rows: continue
                
                # Identify table by headers
                header_cells = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])]
                if '個股名稱' in header_cells and '投資比例(%)' in header_cells:
                    name_idx = header_cells.index('個股名稱')
                    weight_idx = header_cells.index('投資比例(%)')
                    
                    for row in rows[1:]:
                        cols = row.find_all("td")
                        if len(cols) <= max(name_idx, weight_idx): continue
                        
                        full_name = cols[name_idx].get_text(strip=True)
                        weight_str = cols[weight_idx].get_text(strip=True).replace("%", "").replace(",", "")
                        
                        try:
                            weight = float(weight_str)
                            if weight <= 0: continue
                        except ValueError:
                            continue
                        
                        # Extract ID and Name: e.g., "台積電(2330.TW)" -> Name: 台積電, ID: 2330
                        match = re.search(r'^(.*?)\((.*?)\)$', full_name)
                        if match:
                            name = match.group(1).strip()
                            sid = match.group(2).strip()
                            if ".TW" in sid:
                                sid = sid.split(".")[0]
                        else:
                            name = full_name
                            sid = full_name # Fallback if no brackets
                            
                        holdings.append({
                            "stock_id": sid,
                            "stock_name": name.replace("*", "").strip(),
                            "weight": weight
                        })
                    break # Success, exit table loop
            
            return holdings
        except Exception as e:
            print(f"❌ Error parsing MoneyDJ {etf_id}: {e}")
            return []
