# Public corporate evidence and fair-value lineage contract (v1)

Status: schema/interface contract; **not** proof that scheduled tasks have written these records or that N100/App consumers are implemented.

## Objective
Public_Data is the durable, public, append-only source for legally redistributable historical company events, investor presentations, disclosures, analyst-estimate provenance, and valuation evidence lineage. ChatGPT discovery and N100 modeling must not create inaccessible evidence only in task summaries. Public App users should be able to query a stock's history and open the original publisher's source. Do not redistribute paywalled reports or copyrighted full text: retain URLs, metadata, independently written short factual summaries, and permitted excerpts only.

## Canonical layout
- `data/ingestion/discovery/events/<symbol>/<event_id>.json`: immutable canonical event records, with corrections/supersessions as new versions.
- `data/ingestion/discovery/backfill_2025_2026/progress/YYYY-MM/<symbol>/<category>.json`: historic scan audit and status.
- `data/ingestion/discovery/incremental/progress/<watcher>/<source_id>/<window_id>.json`: incremental window status and retry audit; do not advance a successful cursor until evidence and index writes succeed.
- `data/ingestion/discovery/incremental/cursors/<watcher>/<source_id>.json`: successful high-watermark and overlapping lookback policy.
- `data/ingestion/discovery/index/by_symbol/<symbol>/YYYY-MM.json`: event IDs, dates, categories, validation status for app timeline.
- `data/ingestion/discovery/index/by_date/YYYY-MM-DD.json`: event IDs for market-wide chronology.
- `data/valuation/evidence_lineage/<model_version>/<as_of>/<symbol>.json`: model output references and evidence/forecast contribution trace.
- `data/valuation/evidence_lineage/index/by_symbol/<symbol>.json`: available as-of snapshots for App lookup.
These are **target paths**; consumers must tolerate missing files and distinguish unavailable from zero events. Existing `data/ingestion/discovery/events/2026/09/` run-oriented records are legacy and must be migrated without loss, deduplicated by event identity, and not treated as fully verified.

## Event schema required fields
```json
{
  "schema_version": "1.0",
  "event_id": "<stable sha256 canonical source key>",
  "event_group_id": "<stable logical event group>",
  "symbol": "2330",
  "event_type": "guidance",
  "title": "Concise original factual description",
  "publisher": "issuer/filing/news publisher",
  "canonical_url": "https://publisher.example/original",
  "source_type": "mops|twse|tpex|issuer_ir|news|analyst_estimate",
  "published_at": "ISO8601 timestamp with offset or null",
  "effective_available_at": "ISO8601 PIT timestamp with offset or null",
  "discovered_at": "ISO8601 timestamp",
  "target_fiscal_period": "2027Q1 or null",
  "observed_facts": [],
  "claims": [],
  "content_hash": "<sha256 if original content retrieved; otherwise null>",
  "claim_status": "candidate|source_verified|disputed|retracted",
  "production_verified": false,
  "requires_raw_fetch": true,
  "supersedes_event_id": null,
  "source_references": []
}
```
Source-specific unknown fields must be null, not inferred. Separate independently verifiable facts from estimates, scenarios, rumors and forecasts. Original publication and availability times are required for PIT eligibility; if unverified, do not feed strict-PIT valuation.

## Valuation lineage schema required fields
```json
{
  "schema_version": "1.0",
  "symbol": "2330",
  "as_of": "YYYY-MM-DD",
  "model_version": "v8_shadow",
  "valuation_status": "shadow_only",
  "currency": "TWD",
  "fair_value": null,
  "price_as_of": null,
  "forecast_inputs": [
    {
      "name": "revenue_growth",
      "period": "2027FY",
      "value": null,
      "unit": "ratio",
      "method": "model|analyst_consensus|issuer_guidance",
      "baseline_value": null,
      "evidence_ids": [],
      "effective_available_at_max": null,
      "confidence": null,
      "contribution_to_fair_value": null
    }
  ],
  "model_components": [],
  "used_event_ids": [],
  "excluded_event_ids_with_reason": [],
  "calculation_run_id": null,
  "generated_at": "ISO8601 timestamp"
}
```
Only populate a numeric contribution when an auditable attribution method actually computes it; never assign invented causality. A public valuation record must distinguish historical replay, shadow estimate, and production estimate. No shadow result may silently replace Production FV.

## Writer and reader acceptance gates
1. Append event, verify GitHub persisted content, update symbol/date indices idempotently, then mark coverage completed. On conflict, re-read and merge; keep failed writes in retry queue.
2. Cross-watcher dedup by canonical source key and content hash; group independent sources of the same logical event under event_group_id without deleting their individual provenance.
3. Every evidence ID used by a valuation must resolve to an event with source URL and timestamp; `effective_available_at <= as_of` for strict-PIT, else mark excluded.
4. Every non-null FV input influenced by a discovered event must list the evidence IDs, model/forecast version, period and transformation; absence of evidence is explicit.
5. App can render a historical stock event timeline, show validation status and source links, and on FV detail show 'evidence used', 'forecast inputs affected', and original publication date.
6. Coverage dashboards report scanned/total windows, completed, retry_required, stale, verified, candidate and indexed counts; never equate task execution with completed ingestion.
7. Confirm all files are public-safe: no private broker report content, paid full-text, tokens, personal data or proprietary research formulas.

## Ownership
ChatGPT scheduled discovery: search, provenance, append-only event and coverage writes. N100: verify raw sources, construct forecast and valuation lineage in shadow mode, run PIT/OOS gates. App: read Public_Data indexes and lineage, display historical evidence and exact references used. All three need implementation and integration tests; this document alone does not implement them.
