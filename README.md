# AEGIS — AI Enterprise Governance & Insight

Observability, cost governance and benchmarking for LLM workloads in an enterprise. Drop-in trace ingestion + analytics dashboard that answers the questions a CFO/CTO asks the day after the AI bill arrives:

- where is the spend going (by department, use case, model)?
- which calls are anomalous (latency spikes, cost outliers, hallucination clusters)?
- which model is actually best for our prompts (multi-model benchmark + LLM-as-judge)?
- what should leadership read on Monday morning (auto-generated weekly report)?

Live demo: <https://aegis.dawidc.pl>

## Stack

- **API** — FastAPI + psycopg3 (Postgres 16)
- **Web** — Vite + React 18 + TypeScript (strict) + Tailwind + Recharts
- **Infra** — Docker Compose behind Traefik, Let's Encrypt SSL
- **Models** — OpenRouter (any model) for benchmark runs

## Run locally

```bash
cp .env.example .env          # set POSTGRES_PASSWORD; OPENROUTER_API_KEY optional
docker compose up -d --build
docker cp seed/seed.py aegis-api-1:/app/ && \
  docker compose exec api python /app/seed.py
```

Then:

- API: <http://localhost:8000> (when exposed; in prod it's behind Traefik on `/v1` + `/healthz`)
- Web: served by nginx on `:80` inside the `web` container

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/healthz` | liveness |
| POST | `/v1/traces` | ingest one LLM call |
| GET  | `/v1/summary?days=7` | top-line KPIs + per-model rollup |
| GET  | `/v1/cost-breakdown?days=7` | cost by department / use case / day |
| GET  | `/v1/anomalies?detect=true` | recent anomalies (optionally re-run detection) |
| POST | `/v1/benchmark` | launch multi-model benchmark |
| GET  | `/v1/benchmark/{id}` | benchmark leaderboard + per-prompt results |
| GET  | `/v1/report/weekly` | C-suite weekly report (markdown) |

Detailed contracts in [`docs/api.md`](docs/api.md).

## Architecture

See [`docs/architecture.md`](docs/architecture.md). TL;DR: Traefik routes `aegis.dawidc.pl` → nginx (SPA) and `/v1`+`/healthz` → FastAPI → Postgres. Anomaly detection runs as a per-request job (z-score over the last 7d window). Benchmarks run as background tasks fanning out to OpenRouter.

## Project layout

```
api/          FastAPI service (app/, Dockerfile, pyproject.toml)
web/          React SPA (src/, Dockerfile, nginx.conf)
db/migrations/  SQL schema (auto-applied via /docker-entrypoint-initdb.d)
seed/         Demo data generator (~8k traces, 4 departments, 8 use cases)
docs/         architecture.md, api.md
compose.yaml  prod stack with Traefik labels
```

## License

MIT.
