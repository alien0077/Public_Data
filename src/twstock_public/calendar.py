from __future__ import annotations
from datetime import date, timedelta

def trading_dates(start: date, end: date, holidays: set[date] | None = None) -> list[date]:
    holidays = holidays or set()
    result = []
    cursor = start
    while cursor <= end:
        if cursor.weekday() < 5 and cursor not in holidays:
            result.append(cursor)
        cursor += timedelta(days=1)
    return result
