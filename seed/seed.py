"""AEGIS — realistic seed generator.

Generates ~10k traces across 7 days, 5 departments, multiple models and
use-cases, with believable cost/latency/quality distributions plus injected
anomalies (latency spikes, hallucination clusters, error bursts).

Run:
    DATABASE_URL=postgresql://aegis:aegis@db:5432/aegis python seed.py
"""
from __future__ import annotations

import os
import random
import math
import json
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

import psycopg

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aegis:aegis@localhost:5432/aegis")
random.seed(42)

# ── Reference data ───────────────────────────────────────────────────────────
DEPARTMENTS = [
    ("Legal",      "CC-LEG-001",  18),
    ("Sales",      "CC-SAL-001", 142),
    ("Engineering","CC-ENG-001", 380),
    ("Support",    "CC-SUP-001", 220),
    ("Marketing",  "CC-MKT-001",  64),
]

USE_CASES = {
    "Legal":       [("contract_review","critical"), ("nda_drafting","high"), ("policy_qa","medium")],
    "Sales":       [("email_outreach","medium"),    ("proposal_gen","high"),  ("crm_summary","low")],
    "Engineering": [("code_review","high"),         ("incident_triage","critical"), ("doc_search","low")],
    "Support":     [("ticket_classify","medium"),   ("kb_answer","high"),     ("escalation_summary","medium")],
    "Marketing":   [("copy_gen","low"),             ("campaign_brief","medium"),("seo_audit","low")],
}

# (model, $/1k prompt, $/1k completion, baseline_latency_ms, quality_bias)
MODELS = [
    ("openai/gpt-4o",                    0.0025, 0.010,   850, 0.92),
    ("openai/gpt-4o-mini",               0.00015,0.0006,  420, 0.81),
    ("anthropic/claude-3.5-sonnet",      0.003,  0.015,   920, 0.94),
    ("anthropic/claude-3.5-haiku",       0.0008, 0.004,   480, 0.85),
    ("meta-llama/llama-3.1-70b",         0.0009, 0.0009,  680, 0.83),
    ("google/gemini-1.5-pro",            0.00125,0.005,   780, 0.88),
]
MODEL_WEIGHTS = [0.28, 0.22, 0.20, 0.12, 0.10, 0.08]

USERS_PER_DEPT = 6


@dataclass
class Ctx:
    dept_ids: dict
    use_case_ids: dict


def setup(cur) -> Ctx:
    dept_ids: dict = {}
    use_case_ids: dict = {}
    for name, cc, hc in DEPARTMENTS:
        cur.execute(
            "INSERT INTO departments (name, cost_center, head_count) VALUES (%s,%s,%s) "
            "ON CONFLICT (name) DO UPDATE SET cost_center=EXCLUDED.cost_center RETURNING id",
            (name, cc, hc),
        )
        dept_ids[name] = cur.fetchone()[0]
        for uc, crit in USE_CASES[name]:
            cur.execute(
                "INSERT INTO use_cases (department_id, name, criticality) VALUES (%s,%s,%s) "
                "ON CONFLICT (department_id, name) DO UPDATE SET criticality=EXCLUDED.criticality RETURNING id",
                (dept_ids[name], uc, crit),
            )
            use_case_ids[(name, uc)] = cur.fetchone()[0]
    return Ctx(dept_ids, use_case_ids)


def synth_prompt(use_case: str) -> tuple[str, str, int, int]:
    """Return (prompt, response, prompt_tokens, completion_tokens)."""
    templates = {
        "contract_review":  ("Review attached MSA section 7.2 for unusual indemnity clauses.",
                             "Section 7.2 contains a mutual indemnity with a $5M cap. Flag: cap excludes IP infringement..."),
        "nda_drafting":     ("Draft mutual NDA between AcmeCo and Vendor for 24 months.",
                             "MUTUAL NON-DISCLOSURE AGREEMENT. This Agreement is entered into..."),
        "policy_qa":        ("What is our data retention period for EU customer logs?",
                             "Per Policy DR-04, EU customer logs are retained for 30 days then anonymized."),
        "email_outreach":   ("Write a cold email to a CTO at a Series B fintech about our embeddings API.",
                             "Subject: 12ms p99 embeddings — would this move your retrieval needle?\n\nHi {name},..."),
        "proposal_gen":     ("Generate a 1-page proposal for Globex covering our enterprise tier.",
                             "Executive Summary: This proposal outlines a 12-month enterprise engagement..."),
        "crm_summary":      ("Summarize last 30 days of activity for account: Initech",
                             "Initech: 4 calls, 2 demos, decision-maker engaged, blocker = procurement timeline."),
        "code_review":      ("Review this PR for race conditions in the connection pool.",
                             "Found potential race in pool.acquire() lines 42-58: missing mutex around..."),
        "incident_triage":  ("Triage incident INC-4421: latency spike in checkout-service.",
                             "Likely cause: connection pool exhaustion after deploy 2026-05-08T14:22Z. Suggest rollback."),
        "doc_search":       ("How do I configure mTLS between gateway and auth-service?",
                             "See runbook RB-23. Generate certs via internal CA (cmd: ./scripts/issue-cert.sh)..."),
        "ticket_classify":  ("Classify ticket: 'My invoice shows wrong currency conversion'.",
                             "Category: Billing > FX. Severity: medium. Route to: Billing-FX queue."),
        "kb_answer":        ("Customer asks: how do I reset my 2FA?",
                             "To reset 2FA: 1) Sign in with backup code 2) Settings > Security > Reset 2FA..."),
        "escalation_summary":("Summarize escalation thread for case 88123.",
                             "Customer escalated after 3 missed SLAs. Root cause: integration mismatch on webhook v2."),
        "copy_gen":         ("Write 3 LinkedIn ad headlines for our Q2 launch.",
                             "1) Ship 10x faster — without rewriting your stack. 2) The data layer your CFO will love..."),
        "campaign_brief":   ("Draft campaign brief for Q3 EMEA expansion.",
                             "Objective: 200 SQLs from DACH+UK. Channels: LinkedIn + 3 industry events..."),
        "seo_audit":        ("Audit our /pricing page for SEO improvements.",
                             "Issues: H1 missing, meta description 220c (truncated), 4 broken internal links..."),
    }
    p, r = templates.get(use_case, ("Generic prompt.", "Generic response."))
    # Add jitter
    pt = max(40, int(random.gauss(180, 60)))
    ct = max(20, int(random.gauss(320, 140)))
    return p, r, pt, ct


def synth_trace(ts: datetime, ctx: Ctx) -> dict:
    dept_name = random.choice(list(ctx.dept_ids.keys()))
    dept_id = ctx.dept_ids[dept_name]
    uc_name, criticality = random.choice(USE_CASES[dept_name])
    uc_id = ctx.use_case_ids[(dept_name, uc_name)]
    user = f"user{random.randint(1, USERS_PER_DEPT)}@{dept_name.lower()}.acme.io"

    model, p_cost, c_cost, base_lat, q_bias = random.choices(MODELS, weights=MODEL_WEIGHTS, k=1)[0]

    prompt, response, pt, ct = synth_prompt(uc_name)
    cost = (pt / 1000.0) * p_cost + (ct / 1000.0) * c_cost

    # Latency: lognormal around baseline, with hour-of-day pressure
    hour = ts.hour
    pressure = 1.0 + 0.4 * math.sin((hour - 6) / 24 * 2 * math.pi)
    latency = int(max(80, random.lognormvariate(math.log(base_lat * pressure), 0.35)))

    status = "ok"
    err = None
    refusal = False
    halluc = max(0.0, min(1.0, random.gauss(1 - q_bias, 0.08)))
    tox = max(0.0, min(1.0, abs(random.gauss(0.02, 0.04))))

    # 3% errors, 1% timeouts, 2% refusals
    roll = random.random()
    if roll < 0.03:
        status = "error"
        err = random.choice(["upstream_5xx", "rate_limited", "context_length_exceeded"])
    elif roll < 0.04:
        status = "timeout"
        latency = 30000
        err = "timeout_30s"
    elif roll < 0.06:
        refusal = True
        response = "I cannot assist with that request."
        ct = 9
        cost = (pt / 1000.0) * p_cost + (ct / 1000.0) * c_cost

    return dict(
        ts=ts, department_id=dept_id, use_case_id=uc_id, user_email=user,
        model=model, provider="openrouter", prompt=prompt, response=response,
        prompt_tokens=pt, completion_tokens=ct, cost_usd=round(cost, 6),
        latency_ms=latency, status=status, error_msg=err,
        hallucination_score=round(halluc, 3), toxicity_score=round(tox, 3),
        refusal=refusal, meta=json.dumps({"criticality": criticality}),
    )


def inject_anomalies(traces: list[dict]) -> None:
    """Mutate a few traces to be obvious outliers — gives anomaly detector something to find."""
    n = len(traces)
    # Latency spike cluster (50 contiguous traces 5x latency)
    i = random.randint(int(n * 0.3), int(n * 0.4))
    for j in range(i, min(i + 50, n)):
        traces[j]["latency_ms"] *= 5
    # Hallucination cluster (one model goes off-rails for 80 traces)
    bad_model = "meta-llama/llama-3.1-70b"
    cnt = 0
    for t in traces[int(n * 0.6):]:
        if t["model"] == bad_model and cnt < 80:
            t["hallucination_score"] = round(random.uniform(0.55, 0.92), 3)
            cnt += 1
    # Error burst (30 errors in a row)
    i = random.randint(int(n * 0.7), int(n * 0.8))
    for j in range(i, min(i + 30, n)):
        traces[j]["status"] = "error"
        traces[j]["error_msg"] = "upstream_5xx"


def main() -> None:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=7)

    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            print("→ seeding reference data")
            ctx = setup(cur)

            print("→ generating 10,000 traces")
            traces = []
            total = 10_000
            for i in range(total):
                # Distribute non-uniformly: more during business hours
                frac = i / total
                ts = start + timedelta(seconds=int(frac * 7 * 86400))
                # Add intra-day jitter
                ts += timedelta(seconds=random.randint(-1800, 1800))
                # Suppress overnight
                if 0 <= ts.hour < 6 and random.random() < 0.7:
                    continue
                traces.append(synth_trace(ts, ctx))

            inject_anomalies(traces)

            print(f"→ inserting {len(traces)} traces")
            with cur.copy(
                "COPY traces (ts, department_id, use_case_id, user_email, model, provider, "
                "prompt, response, prompt_tokens, completion_tokens, cost_usd, latency_ms, "
                "status, error_msg, hallucination_score, toxicity_score, refusal, meta) "
                "FROM STDIN"
            ) as copy:
                for t in traces:
                    copy.write_row((
                        t["ts"], t["department_id"], t["use_case_id"], t["user_email"],
                        t["model"], t["provider"], t["prompt"], t["response"],
                        t["prompt_tokens"], t["completion_tokens"], t["cost_usd"],
                        t["latency_ms"], t["status"], t["error_msg"],
                        t["hallucination_score"], t["toxicity_score"], t["refusal"],
                        t["meta"],
                    ))
        conn.commit()
    print("✓ seed complete")


if __name__ == "__main__":
    main()
