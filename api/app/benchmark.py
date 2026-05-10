"""Multi-model benchmark runner. Same prompts across models via OpenRouter,
optional judge LLM scoring.
"""
from __future__ import annotations

import asyncio
import json
from .db import pool
from .openrouter import complete

JUDGE_MODEL = "openai/gpt-4o-mini"
JUDGE_SYSTEM = (
    "You are a strict evaluator. Score the assistant's response on a 0-10 scale "
    "for correctness, helpfulness and clarity. Output ONLY a JSON object: "
    '{"score": <0-10 float>, "reason": "<short>"}.'
)


async def run_benchmark(name: str, prompts: list[str], models: list[str],
                        use_case_id: int | None = None, judge: bool = True) -> int:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO benchmark_runs(name, use_case_id, prompt_set, models, status)
               VALUES (%s, %s, %s::jsonb, %s, 'running')
               RETURNING id""",
            (name, use_case_id, json.dumps(prompts), models),
        )
        run_id = cur.fetchone()[0]

    tasks = [
        _run_one(run_id, idx, prompt, model, judge)
        for idx, prompt in enumerate(prompts)
        for model in models
    ]
    await asyncio.gather(*tasks, return_exceptions=True)

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE benchmark_runs SET status='done' WHERE id=%s", (run_id,))
    return run_id


async def _run_one(run_id: int, prompt_idx: int, prompt: str, model: str, judge: bool):
    try:
        out = await complete(model, prompt)
    except Exception:
        return

    score, reason = (None, None)
    if judge:
        score, reason = await _judge(prompt, out["response"])

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO benchmark_results
               (run_id, model, prompt_idx, response, latency_ms, cost_usd,
                quality_score, judge_rationale, prompt_tokens, completion_tokens)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (run_id, model, prompt_idx, out["response"], out["latency_ms"],
             out["cost_usd"], score, reason,
             out["prompt_tokens"], out["completion_tokens"]),
        )


async def _judge(prompt: str, response: str) -> tuple[float | None, str | None]:
    try:
        out = await complete(
            JUDGE_MODEL,
            f"PROMPT:\n{prompt}\n\nRESPONSE:\n{response}",
            system=JUDGE_SYSTEM,
        )
        text = out["response"].strip()
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            obj = json.loads(text[s:e + 1])
            return float(obj.get("score", 0)) / 10.0, str(obj.get("reason", ""))[:500]
    except Exception:
        pass
    return None, None
