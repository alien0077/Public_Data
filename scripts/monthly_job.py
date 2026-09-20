import pandas as pd
import requests
import io
import os
import time
import urllib3
import numpy as np
import json
import calendar
from datetime import datetime, timezone, timedelta
from github_utils import GitHubDataExporter

# 🚀 v1.24.40: 全自動月營收同步引擎 (含補洞與台北時區校準)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
exporter = GitHubDataExporter()
session = requests.Session()
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}


def get_now_tpe():
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8)))


def pf(v):
    if v is None or pd.isna(v):
        return 0.0
    s = str(v).replace(',', '').strip()
    if s == "" or s == "--" or s.lower() == "nan":
        return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0


def fetch_mops_monthly(year, month):
    """從 MOPS 抓取指定月份的全市場營收 (sii + otc)."""
    tw_year = year - 1911
    all_mkt_data = []
    for mkt in ['sii', 'otc']:
        url = f"https://mopsov.twse.com.tw/nas/t21/{mkt}/t21sc03_{tw_year}_{month}_0.html"
        try:
            resp = session.get(url, headers=HEADERS, timeout=20, verify=False)
            if resp.status_code == 200:
                resp.encoding = 'cp950'
                dfs = pd.read_html(io.StringIO(resp.text))
                for df in dfs:
                    cols = ["".join(str(c).split()) for c in df.columns.get_level_values(df.columns.nlevels - 1)]
                    if "公司代號" in cols:
                        df.columns = cols
                        df = df[df['公司代號'].astype(str).str.isdigit()].copy()
                        if not df.empty:
                            all_mkt_data.append(df)
        except Exception as e:
            print(f"(Err: {mkt} {str(e)[:20]})", end=" ")
        time.sleep(3)

    if not all_mkt_data:
        return pd.DataFrame()

    final_df = pd.concat(all_mkt_data, ignore_index=True)
    results = []
    for _, r in final_df.iterrows():
        # 🚀 v2.2: 補齊所有 App 需要的欄位名
        results.append({
            "id": str(r['公司代號']).strip(),
            "rev": pf(r.get('當月營收')),
            "mom": pf(r.get('上月比較增減(%)')),
            "yoy": pf(r.get('去年同月增減(%)')),
            "cum_rev": pf(r.get('當月累計營收')),
            "cum_yoy": pf(r.get('前期比較增減(%)')),
        })
    return pd.DataFrame(results)


def _monthly_period(row):
    if not isinstance(row, dict):
        return ""
    return str(row.get("period") or row.get("date") or "")[:7]


def _atomic_json_write(path, payload):
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp_path, path)


def merge_symbol_monthly_payload(payload, candidate, symbol):
    """Upsert one period without ever removing an existing historical period."""
    payload = payload if isinstance(payload, dict) else {}
    existing = payload.get("data", payload.get("stocks", []))
    existing = existing if isinstance(existing, list) else []

    before_periods = {_monthly_period(row) for row in existing if _monthly_period(row)}
    by_period = {_monthly_period(row): dict(row) for row in existing if _monthly_period(row)}
    period = _monthly_period(candidate)
    if not period:
        raise ValueError(f"monthly candidate for {symbol} has no period")

    previous = by_period.get(period, {})
    merged = {**previous, **candidate}
    # Keep an exact publication timestamp when an older enriched record has
    # one; the statutory deadline is only a conservative fallback.
    if previous.get("published_at") and not candidate.get("published_at"):
        merged["published_at"] = previous["published_at"]
    by_period[period] = merged

    rows = sorted(by_period.values(), key=_monthly_period, reverse=True)
    after_periods = {_monthly_period(row) for row in rows if _monthly_period(row)}
    missing = sorted(before_periods - after_periods)
    if missing:
        raise RuntimeError(f"monthly history regression for {symbol}: removed periods {missing[:12]}")
    if len(after_periods) < len(before_periods):
        raise RuntimeError(
            f"monthly history regression for {symbol}: period count {len(before_periods)} -> {len(after_periods)}"
        )
    if before_periods and max(after_periods) < max(before_periods):
        raise RuntimeError(
            f"monthly history regression for {symbol}: latest period {max(before_periods)} -> {max(after_periods)}"
        )

    output = dict(payload)
    output["schema_version"] = payload.get("schema_version") or "1.1"
    output["stock_id"] = str(payload.get("stock_id") or symbol)
    output["data"] = rows
    output.pop("stocks", None)
    return output


def merge_symbol_monthly_files(data_root, frame, period, retrieved_at):
    """Merge monthly revenue into the per-symbol schema consumed by V2.1."""
    target_dir = os.path.join(data_root, "monthly")
    os.makedirs(target_dir, exist_ok=True)
    year, month = (int(value) for value in period.split("-"))
    availability = f"{year + (month == 12):04d}-{1 if month == 12 else month + 1:02d}-10"
    period_end = f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"
    source_url = f"https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_{year - 1911}_{month}_0.html"
    written = 0
    for record in frame.to_dict(orient="records"):
        symbol = str(record.get("id") or "").strip()
        if not symbol:
            continue
        path = os.path.join(target_dir, f"{symbol}.json")
        try:
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            payload = {}

        candidate = {
            "date": f"{period}-01",
            "period": period,
            "period_end": period_end,
            "value": float(record.get("rev") or 0.0),
            "yoy": float(record.get("yoy") or 0.0),
            "mom": float(record.get("mom") or 0.0),
            "raw_value": float(record.get("rev") or 0.0),
            "raw_unit": "thousand_TWD",
            "effective_available_at": availability,
            "published_at": None,
            "source": "MOPS monthly revenue",
            "source_url": source_url,
            "retrieved_at": retrieved_at,
            "availability_basis": "statutory_deadline_upper_bound",
        }
        output = merge_symbol_monthly_payload(payload, candidate, symbol)
        if output != payload:
            _atomic_json_write(path, output)
            written += 1
    return written


def _materialized_revenue_months(data_root):
    """Infer broadly materialized revenue periods from the actual per-symbol monthly files."""
    target_dir = os.path.join(data_root, "monthly")
    counts = {}
    symbols = 0
    if not os.path.isdir(target_dir):
        return set()
    for name in os.listdir(target_dir):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(target_dir, name), encoding="utf-8") as handle:
                payload = json.load(handle)
            rows = payload.get("data", payload.get("stocks", [])) if isinstance(payload, dict) else []
            periods = {_monthly_period(row) for row in rows if _monthly_period(row)}
            if periods:
                symbols += 1
                for period in periods:
                    counts[period] = counts.get(period, 0) + 1
        except (OSError, json.JSONDecodeError):
            continue
    if not symbols:
        return set()
    # A month is materialized when it exists for a majority of the monthly universe.
    # This is only the skip/index criterion; fetched source rows are still validated separately.
    threshold = max(1, symbols // 2)
    return {period for period, count in counts.items() if count >= threshold}


def _previous_month(year, month):
    if month == 1:
        return year - 1, 12
    return year, month - 1


def main():
    print("📡 啟動月營收自動同步引擎 (V2.0 - 補洞版)...")
    now_tpe = get_now_tpe()

    # Golden crawler coverage starts at 2024-01. Hole detection is based on the
    # actual monthly revenue files, not index.available_months (a different contract).
    start_month = os.getenv("TW_MONTHLY_START", "2024-01")
    existing_months = _materialized_revenue_months(exporter.base_path)
    force_historical = os.getenv("TW_MONTHLY_FORCE_BACKFILL") == "1"

    # MOPS monthly revenue for month M is complete in M+1. Never treat the
    # current calendar month as an expected revenue period.
    end_y, end_m = _previous_month(now_tpe.year, now_tpe.month)
    curr_y, curr_m = (int(value) for value in start_month.split("-"))
    scan_months = []
    while (curr_y < end_y) or (curr_y == end_y and curr_m <= end_m):
        m_str = f"{curr_y}-{curr_m:02d}"
        scan_months.append((curr_y, curr_m, m_str))
        curr_m += 1
        if curr_m > 12:
            curr_m = 1
            curr_y += 1

    latest_success = max(existing_months) if existing_months else None
    processed_count = 0
    failed_months = []
    for yr, month, m_str in scan_months:
        if m_str in existing_months and not force_historical:
            continue

        print(f"🔍 處理月份: {m_str}...", end=" ", flush=True)
        df_new = fetch_mops_monthly(yr, month)

        minimum_rows = int(os.getenv("TW_MONTHLY_MIN_ROWS", "1800"))
        if not df_new.empty and len(df_new) >= minimum_rows:
            written = merge_symbol_monthly_files(exporter.base_path, df_new, m_str, now_tpe.isoformat())
            latest_success = max(latest_success or m_str, m_str)
            processed_count += 1
            print(f"✅ 成功 ({len(df_new)} 筆，寫入 per-symbol={written})")
        else:
            print(f"❌ 失敗 (筆數 {len(df_new)} 不足 {minimum_rows})")
            failed_months.append(m_str)

        time.sleep(3)

    if latest_success:
        exporter.update_index("latest_monthly_revenue", latest_success)
        print(f"🏁 同步結束，最新月份: {latest_success}, 本次更新: {processed_count} 筆")
    if failed_months:
        raise RuntimeError(f"月營收資料未完整產出：{', '.join(failed_months)}")


if __name__ == "__main__":
    main()
