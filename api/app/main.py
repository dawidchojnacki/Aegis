"""AEGIS FastAPI app. Endpoints:

  POST /v1/traces          ingest a single LLM call
  GET  /v1/summary         top-line metrics (last 7d)
  GET  /v1/cost-breakdown  cost rolled up by department / model / day
  GET  /v1/anomalies       recent anomalies (with detection trigger)
  POST /v1/benchmark       launch multi-model benchmark run
  GET  /v1/benchmark/{id}  benchmark results + leaderboard
  GET  /v1/report/weekly   C-suite weekly report (markdown)
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware

from .db import query, execute, pool
from .models import TraceIn, BenchmarkRequest
from .anomaly import detect_and_persist
from . import benchmark as bench
from .email_report import ReportEmailIn, send_report_email

app = FastAPI(title="AEGIS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz():
    return {"ok": True}


# ---------- ingest ----------

@app.post("/v1/traces", status_code=201)
def ingest_trace(t: TraceIn):
    dept = query("SELECT id FROM departments WHERE name=%s", (t.department,))
    if not dept:
        raise HTTPException(404, f"unknown department: {t.department}")
    uc = query(
        "SELECT id FROM use_cases WHERE department_id=%s AND name=%s",
        (dept[0]["id"], t.use_case),
    )
    if not uc:
        raise HTTPException(404, f"unknown use_case: {t.use_case}")

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO traces
               (department_id, use_case_id, user_email, model, provider,
                prompt, response, prompt_tokens, completion_tokens,
                cost_usd, latency_ms, status, error_msg, meta)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
               RETURNING id""",
            (dept[0]["id"], uc[0]["id"], t.user_email, t.model, t.provider,
             t.prompt, t.response, t.prompt_tokens, t.completion_tokens,
             t.cost_usd, t.latency_ms, t.status, t.error_msg, json.dumps(t.meta)),
        )
        tid = cur.fetchone()[0]
    return {"id": tid}


# ---------- analytics ----------

@app.get("/v1/summary")
def summary(days: int = 7):
    rows = query(
        """SELECT COUNT(*)::bigint AS calls,
                  COALESCE(SUM(cost_usd),0)::float AS cost,
                  COALESCE(SUM(total_tokens),0)::bigint AS tokens,
                  AVG(latency_ms)::float AS avg_latency,
                  AVG(hallucination_score)::float AS avg_hallucination,
                  COUNT(*) FILTER (WHERE status<>'ok')::bigint AS errors
           FROM traces WHERE ts > NOW() - (%s || ' days')::interval""",
        (days,),
    )
    by_model = query(
        """SELECT model, COUNT(*)::bigint AS calls,
                  SUM(cost_usd)::float AS cost,
                  AVG(latency_ms)::float AS avg_latency
           FROM traces WHERE ts > NOW() - (%s || ' days')::interval
           GROUP BY model ORDER BY cost DESC""",
        (days,),
    )
    return {"window_days": days, "totals": rows[0], "by_model": by_model}


@app.get("/v1/cost-breakdown")
def cost_breakdown(days: int = 7):
    by_dept = query(
        """SELECT d.name AS department, d.cost_center,
                  COUNT(*)::bigint AS calls,
                  SUM(t.cost_usd)::float AS cost,
                  SUM(t.total_tokens)::bigint AS tokens
           FROM traces t JOIN departments d ON d.id = t.department_id
           WHERE t.ts > NOW() - (%s || ' days')::interval
           GROUP BY d.name, d.cost_center
           ORDER BY cost DESC""",
        (days,),
    )
    by_use_case = query(
        """SELECT d.name AS department, u.name AS use_case, u.criticality,
                  COUNT(*)::bigint AS calls, SUM(t.cost_usd)::float AS cost
           FROM traces t
           JOIN use_cases u ON u.id = t.use_case_id
           JOIN departments d ON d.id = t.department_id
           WHERE t.ts > NOW() - (%s || ' days')::interval
           GROUP BY d.name, u.name, u.criticality
           ORDER BY cost DESC""",
        (days,),
    )
    daily = query(
        """SELECT date_trunc('day', ts) AS day,
                  SUM(cost_usd)::float AS cost,
                  COUNT(*)::bigint AS calls
           FROM traces WHERE ts > NOW() - (%s || ' days')::interval
           GROUP BY 1 ORDER BY 1""",
        (days,),
    )
    return {"by_department": by_dept, "by_use_case": by_use_case, "daily": daily}


@app.get("/v1/anomalies")
def list_anomalies(detect: bool = False, limit: int = 100):
    if detect:
        detect_and_persist()
    rows = query(
        """SELECT id, detected_at, trace_id, kind, severity, z_score, context
           FROM anomalies
           ORDER BY detected_at DESC
           LIMIT %s""",
        (limit,),
    )
    return {"anomalies": rows}


# ---------- benchmark ----------

@app.post("/v1/benchmark", status_code=202)
async def start_benchmark(req: BenchmarkRequest, bg: BackgroundTasks):
    if not req.prompts or not req.models:
        raise HTTPException(400, "prompts and models required")

    uc_id = None
    if req.use_case:
        rows = query("SELECT id FROM use_cases WHERE name=%s LIMIT 1", (req.use_case,))
        if rows:
            uc_id = rows[0]["id"]

    bg.add_task(_run_bench_sync, req.name, req.prompts, req.models, uc_id)
    return {"status": "queued", "name": req.name,
            "models": req.models, "n_prompts": len(req.prompts)}


def _run_bench_sync(name, prompts, models, uc_id):
    asyncio.run(bench.run_benchmark(name, prompts, models, uc_id))


@app.get("/v1/benchmark")
def list_benchmarks():
    return {"runs": query(
        """SELECT id, created_at, name, use_case_id, models, status
           FROM benchmark_runs ORDER BY created_at DESC LIMIT 50"""
    )}


@app.get("/v1/benchmark/{run_id}")
def benchmark_detail(run_id: int):
    runs = query("SELECT * FROM benchmark_runs WHERE id=%s", (run_id,))
    if not runs:
        raise HTTPException(404, "not found")
    leaderboard = query(
        """SELECT model,
                  COUNT(*)::bigint AS n,
                  AVG(quality_score)::float AS avg_quality,
                  AVG(latency_ms)::float AS avg_latency,
                  SUM(cost_usd)::float AS total_cost,
                  AVG(cost_usd)::float AS avg_cost
           FROM benchmark_results
           WHERE run_id=%s
           GROUP BY model
           ORDER BY avg_quality DESC NULLS LAST""",
        (run_id,),
    )
    results = query(
        """SELECT model, prompt_idx, response, latency_ms, cost_usd,
                  quality_score, judge_rationale
           FROM benchmark_results WHERE run_id=%s
           ORDER BY prompt_idx, model""",
        (run_id,),
    )
    return {"run": runs[0], "leaderboard": leaderboard, "results": results}


# ---------- weekly report ----------

@app.get("/v1/report/weekly")
def weekly_report():
    s = summary(7)
    cb = cost_breakdown(7)
    an = query(
        """SELECT kind, severity, COUNT(*)::bigint AS n
           FROM anomalies WHERE detected_at > NOW() - INTERVAL '7 days'
           GROUP BY kind, severity ORDER BY n DESC"""
    )
    totals = s["totals"]
    top_dept = cb["by_department"][:3]
    top_models = s["by_model"][:3]

    week_end = datetime.now(timezone.utc).date()
    week_start = week_end - timedelta(days=7)

    md = [
        f"# AEGIS Weekly Report — {week_start} → {week_end}",
        "",
        "## Executive summary",
        f"- **Calls:** {totals['calls']:,}",
        f"- **Spend:** ${totals['cost']:.2f}",
        f"- **Tokens:** {totals['tokens']:,}",
        f"- **Avg latency:** {totals['avg_latency']:.0f} ms",
        f"- **Errors:** {totals['errors']:,}",
        f"- **Avg hallucination signal:** {(totals['avg_hallucination'] or 0):.2f}",
        "",
        "## Top departments by spend",
    ]
    for d in top_dept:
        md.append(f"- **{d['department']}** ({d['cost_center']}): "
                  f"${d['cost']:.2f} over {d['calls']:,} calls")
    md += ["", "## Top models by spend"]
    for m in top_models:
        md.append(f"- `{m['model']}` — ${m['cost']:.2f}, "
                  f"{m['calls']:,} calls, {m['avg_latency']:.0f}ms avg")
    md += ["", "## Anomalies"]
    if not an:
        md.append("- None detected.")
    for a in an:
        md.append(f"- {a['kind']} ({a['severity']}): {a['n']}")
    md += [
        "",
        "## Recommendations",
        "- Audit the highest-spend use cases for prompt-length reduction "
        "(target: 20% token cut).",
        "- Route low-criticality calls to cheaper models "
        "(`gpt-4o-mini` / `claude-3.5-haiku`).",
        "- Investigate models showing hallucination clusters; consider "
        "retrieval grounding before promoting to critical workloads.",
    ]
    return {"markdown": "\n".join(md), "generated_at": datetime.now(timezone.utc)}


@app.post("/v1/report/email", status_code=200)
async def email_report(body: ReportEmailIn, request: Request):
    return await send_report_email(request, body)
