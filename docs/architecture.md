# Architecture

## Topology

```
              ┌──────────────────────┐
 internet ──► │  Traefik (n8n stack) │  *.dawidc.pl, Let's Encrypt
              └──────────┬───────────┘
                         │  Host(aegis.dawidc.pl)
              ┌──────────┴───────────┐
              │                      │
   priority=1 │                      │ priority=100
   (fallback) │                      │ PathPrefix(/v1) || PathPrefix(/healthz)
              ▼                      ▼
        ┌──────────┐           ┌──────────┐
        │  web     │           │   api    │   FastAPI :8000
        │  nginx80 │           │ uvicorn  │
        │  SPA     │           └─────┬────┘
        └──────────┘                 │
                                     ▼
                              ┌────────────┐
                              │ Postgres16 │   aegis_db volume
                              └────────────┘
```

Traefik runs in the sibling `n8n-compose` stack; AEGIS attaches to its `n8n-compose_default` network as `external: true`. The API and web routers share the same host; the API router has higher priority + a path constraint so `/v1/*` and `/healthz` reach FastAPI while everything else (including `/assets/*`) falls through to the SPA.

## Data model

| Table | Purpose |
|-------|---------|
| `departments` | tenant-like dimension: name, cost center |
| `use_cases` | per-department workload bucket with a `criticality` (low/med/high) |
| `traces` | one row per LLM call: model, tokens, cost, latency, status, hallucination_score, JSONB meta |
| `anomalies` | detector output: kind (cost_spike / latency_spike / hallucination_cluster), severity, z-score, context |
| `benchmark_runs` | a benchmark job: name, models[], prompts[], status |
| `benchmark_results` | one row per (run, model, prompt): response, latency, cost, judge quality_score |

Indexes prioritise the hot path: `traces(ts DESC)`, `traces(department_id, ts DESC)`, `traces(model)`, partial index on errors. `anomalies(detected_at DESC)` for the dashboard list.

## Anomaly detection

Per request to `/v1/anomalies?detect=true`:

1. Pull traces from the last 7 days, group by (model, use_case).
2. For each group compute mean + stddev of `cost_usd` and `latency_ms`.
3. Flag rows where `z-score > 3` or `hallucination_score > 0.7`.
4. Insert into `anomalies` with the trigger context as JSONB.

Cheap, deterministic, runs in <100ms on the seed dataset. For a production scale a scheduled job + materialised view would replace the inline detector.

## Benchmarks

`POST /v1/benchmark` with `{name, models[], prompts[], use_case?}`:

1. Insert a `benchmark_runs` row (status=`running`).
2. Background task fans out to OpenRouter — `prompts × models` calls in parallel, bounded by a semaphore.
3. For each response a judge prompt scores quality 1–10 against the original prompt (LLM-as-judge using `gpt-4o-mini` by default).
4. Results land in `benchmark_results`; run is marked `done`.

`GET /v1/benchmark/{id}` returns a leaderboard (per-model averages) plus the raw per-prompt rows.

## Frontend

Single SPA, four tabs:

- **Overview** → `/v1/summary` (KPI tiles + per-model bar chart)
- **Cost** → `/v1/cost-breakdown` (department + daily stacked area)
- **Anomalies** → `/v1/anomalies` (table with severity badges + sparkline of z-score)
- **Weekly** → `/v1/report/weekly` (markdown rendered in `<pre>`)

API base is relative — Traefik routes by path on the same host, so the SPA never needs a CORS hop.

## Decisions worth calling out

- **Postgres, not Clickhouse.** Trace volumes here are observability for *governance*, not raw telemetry. ~10k–100k rows/day fits comfortably in OLTP indexes; we keep the operational footprint to one DB.
- **No ORM.** The query shapes are simple and aggregation-heavy; psycopg3 + raw SQL keeps the rollup logic visible and avoids an N+1 trap on `cost-breakdown`.
- **LLM-as-judge for benchmarks.** Manually labeling prompts doesn't scale and the use case (relative model ranking on *your* prompts) tolerates judge noise — we report quality as an average over many prompts.
- **Inline anomaly detection.** Acceptable at this scale; would move to a scheduled job + materialised view if traces/day went 100×.
