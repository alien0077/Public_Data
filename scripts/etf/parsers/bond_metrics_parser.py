import re
from bs4 import BeautifulSoup

class BondMetricsParser:
    def __init__(self):
        pass

    def parse_from_html(self, html):
        """
        Extract bond metrics (duration, yield, maturity, type) from HTML content.
        """
        metrics = {}
        if not html:
            return metrics
            
        # Extract text content for easier regex matching
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        
        # 1. Duration (存續期間)
        duration_match = re.search(r'存續期間[:：]?\s*(\d+\.?\d*)', text)
        if duration_match:
            metrics["duration"] = float(duration_match.group(1))
            
        # 2. Yield (殖利率)
        yield_match = re.search(r'(?:平均)?殖利率[:：]?\s*(\d+\.?\d*)%?', text)
        if not yield_match:
            # Try finding a number near "殖利率"
            yield_match = re.search(r'殖利率\s*(\d+\.?\d*)', text)
        if yield_match:
            metrics["yield"] = float(yield_match.group(1))
            
        # 3. Maturity (到期日)
        maturity_match = re.search(r'到期日?[:：]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})', text)
        if maturity_match:
            metrics["maturity"] = maturity_match.group(1)
        else:
            # Fallback for general maturity descriptions
            m2 = re.search(r'到期[:：]?\s*([^<>\s,;]*)', text)
            if m2 and len(m2.group(1)) > 1:
                metrics["maturity"] = m2.group(1)

        # 4. Bond Type (債券類型)
        type_match = re.search(r'債券類型[:：]?\s*([^<>\s,;]*)', text)
        if type_match:
            metrics["bond_type"] = type_match.group(1)
            
        return metrics
