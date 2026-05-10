"""Thin OpenRouter client. Used for benchmark runs and live ingest.

Env: OPENROUTER_API_KEY. If unset, returns deterministic mock responses so the
demo runs offline.
"""
from __future__ import annotations

import os
import time
import hashlib
import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
KEY = os.environ.get("OPENROUTER_API_KEY", "")


async def complete(model: str, prompt: str, system: str | None = None) -> dict:
    if not KEY:
        return _mock(model, prompt)

    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})

    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {KEY}",
                "HTTP-Referer": "https://aegis.dawidc.pl",
                "X-Title": "AEGIS",
            },
            json={"model": model, "messages": msgs},
        )
    latency_ms = int((time.perf_counter() - t0) * 1000)
    r.raise_for_status()
    data = r.json()
    usage = data.get("usage", {})
    return {
        "response": data["choices"][0]["message"]["content"],
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "latency_ms": latency_ms,
        "cost_usd": float(data.get("usage", {}).get("cost", 0.0)),
        "raw": data,
    }


def _mock(model: str, prompt: str) -> dict:
    h = hashlib.sha256(f"{model}:{prompt}".encode()).hexdigest()
    pt = 50 + len(prompt) // 4
    ct = 80 + (int(h[:4], 16) % 200)
    return {
        "response": f"[mock:{model}] Considering your prompt, the answer is {h[:8]}...",
        "prompt_tokens": pt,
        "completion_tokens": ct,
        "latency_ms": 200 + (int(h[4:8], 16) % 800),
        "cost_usd": round((pt * 0.000002 + ct * 0.000008), 6),
        "raw": {"mock": True},
    }
