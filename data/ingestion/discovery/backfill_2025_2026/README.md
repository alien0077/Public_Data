# ChatGPT historical corporate-event backfill (2025–2026)

This folder is the persistent source of truth for scheduled ChatGPT discovery. Scope: all TWSE and TPEx symbols, 2025-01 through 2026-10; categories: news, investor_relations, material_disclosures, analyst_revisions. No symbol whitelist.

## Append-only ledger contract

Write one JSON record per symbol/month/category at `progress/YYYY-MM/<symbol>/<category>.json` using GitHub create-file; use update-file with the current blob SHA only for a transition. Required fields: schema_version, symbol, year_month, category, status (pending|in_progress|completed|retry_required), searched_sources, query_windows, source_urls, found_count, verified_count, search_started_at, search_completed_at, search_version, last_error. A completed scan means that the defined source/query checklist was searched, **not** that all historical information exists. Empty result is valid only with source/query audit evidence.

Store each discovery event in `events/<symbol>/<sha256-canonical-url-or-source-event-key>.json` (create-only); include canonical_url, publisher, published_at, effective_available_at, event_type, target_fiscal_period, observed_facts, claim_status, content_hash, requires_raw_fetch, production_verified=false by default, and source references. Distinct articles about one event share event_group_id; never merge independent claims without evidence.

Before every scheduled batch: (1) load current TWSE/TPEx universe, (2) read existing progress and event keys, (3) choose pending/retry-required items, (4) verify primary URLs and original publication timestamps, (5) write events first, (6) mark progress completed last. On conflict, refetch and reconcile; never overwrite another writer's results. On interrupted runs, retry stale in_progress items; do not skip them. Count completion only from persisted completed records. Preserve negative evidence, source failures, and unverifiable candidate status.

The two incremental ChatGPT watchers should deduplicate against these event keys but must not change historical completion status. The N100 model pipeline consumes verified evidence downstream; this ledger never directly changes Production FV.

**Initial state:** no symbol-month scan is marked completed by creating this README. Coverage is zero until independently persisted evidence and progress records are present.
