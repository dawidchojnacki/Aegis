# API reference

Base URL (prod): `https://aegis.dawidc.pl`

All responses are JSON unless noted. Times are UTC ISO-8601.

## `GET /healthz`

Liveness probe.

```json
{ "ok": true }
```

## `POST /v1/traces`

Ingest a single LLM call.

```json
{
  "department": "Engineering",
  "use_case": "code-review",
  "user_email": "alice@example.com",
  "model": "openai/gpt-4o",
  "provider": "openrouter",
  "prompt": "...",
  "response": "...",
  "prompt_tokens": 812,
  "completion_tokens": 240,
  "cost_usd": 0.0143,
  "latency_ms": 1320,
  "status": "ok",
  "error_msg": null,
  "meta": { "trace_id": "abc123" }
}
```

`201` →

```json
{ "id": 8270 }
```

`404` if `department` or `use_case` doesn't exist.

## `GET /v1/summary?days=7`

Top-line metrics over the last `days` (default 7).

```json
{
  "window_days": 7,
  "totals": {
    "calls": 8251,
    "cost": 20.21,
    "tokens": 4051866,
    "avg_latency": 1072.35,
    "avg_hallucination": 0.13,
    "errors": 314
  },
  "by_model": [
    { "model": "openai/gpt-4o", "calls": 2384, "cost": 8.48, "avg_latency": 1346.2 },
    ...
  ]
}
```

## `GET /v1/cost-breakdown?days=7`

Returns three rollups:

```json
{
  "by_department": [
    { "department": "Engineering", "cost_center": "ENG-001",
      "calls": 3120, "cost": 9.42, "tokens": 1_810_000 }
  ],
  "by_use_case": [
    { "department": "Engineering", "use_case": "code-review",
      "criticality": "med", "calls": 1840, "cost": 5.10 }
  ],
  "daily": [
    { "day": "2026-05-04T00:00:00Z", "cost": 2.81, "calls": 1180 }
  ]
}
```

## `GET /v1/anomalies?detect=false&limit=100`

`detect=true` re-runs the detector before returning.

```json
{
  "anomalies": [
    {
      "id": 42,
      "detected_at": "2026-05-09T18:11:03Z",
      "trace_id": 7891,
      "kind": "cost_spike",
      "severity": "high",
      "z_score": 4.7,
      "context": { "model": "openai/gpt-4o", "use_case": "long-doc-summary" }
    }
  ]
}
```

`kind ∈ {cost_spike, latency_spike, hallucination_cluster}`
`severity ∈ {low, med, high}`

## `POST /v1/benchmark`

Launch a benchmark run. Async — returns immediately; results land as the workers finish.

```json
{
  "name": "support-bot Q2",
  "use_case": "support-reply",
  "prompts": ["...", "..."],
  "models": ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "openai/gpt-4o-mini"]
}
```

`202` →

```json
{ "status": "queued", "name": "support-bot Q2",
  "models": ["openai/gpt-4o", ...], "n_prompts": 12 }
```

Requires `OPENROUTER_API_KEY` in env.

## `GET /v1/benchmark`

List recent runs (latest 50).

## `GET /v1/benchmark/{id}`

```json
{
  "run": { "id": 7, "name": "support-bot Q2", "status": "done", ... },
  "leaderboard": [
    { "model": "anthropic/claude-3.5-sonnet",
      "n": 12, "avg_quality": 8.4, "avg_latency": 1410, "total_cost": 0.18, "avg_cost": 0.015 }
  ],
  "results": [
    { "model": "openai/gpt-4o", "prompt_idx": 0, "response": "...",
      "latency_ms": 1320, "cost_usd": 0.011, "quality_score": 8.0,
      "judge_rationale": "Accurate and concise but missed edge case X." }
  ]
}
```

## `GET /v1/report/weekly`

C-suite report rendered as markdown.

```json
{
  "markdown": "# AEGIS Weekly Report — 2026-05-03 → 2026-05-10\n\n## Executive summary\n- **Calls:** 8,251\n...",
  "generated_at": "2026-05-10T09:20:00Z"
}
```

Sections: executive summary → top departments by spend → top models by spend → anomalies → recommendations.
