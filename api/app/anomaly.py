"""Anomaly detection over recent traces. Three signals:

- latency_spike: per-model rolling z-score on latency_ms > 3
- hallucination_cluster: hallucination_score window mean > 0.7 over >=10 traces
- error_burst: error rate > 20% over a 15-minute window per department
"""
from __future__ import annotations

import json
from .db import query, execute


SQL_LATENCY = """
WITH stats AS (
  SELECT model,
         AVG(latency_ms)::float AS mu,
         STDDEV_POP(latency_ms)::float AS sd
  FROM traces
  WHERE ts > NOW() - INTERVAL '7 days' AND status = 'ok'
  GROUP BY model
)
SELECT t.id, t.model, t.latency_ms, s.mu, s.sd,
       (t.latency_ms - s.mu) / NULLIF(s.sd, 0) AS z
FROM traces t
JOIN stats s USING (model)
WHERE t.ts > NOW() - INTERVAL '1 hour'
  AND s.sd > 0
  AND (t.latency_ms - s.mu) / NULLIF(s.sd, 0) > 3
ORDER BY z DESC
LIMIT 100;
"""

SQL_HALLU = """
SELECT model, use_case_id,
       COUNT(*) AS n,
       AVG(hallucination_score)::float AS avg_score
FROM traces
WHERE ts > NOW() - INTERVAL '24 hours'
  AND hallucination_score IS NOT NULL
GROUP BY model, use_case_id
HAVING COUNT(*) >= 10 AND AVG(hallucination_score) > 0.7
ORDER BY avg_score DESC;
"""

SQL_ERRBURST = """
SELECT department_id,
       date_trunc('hour', ts) + (FLOOR(EXTRACT(minute FROM ts)/15) * INTERVAL '15 minute') AS bucket,
       COUNT(*) FILTER (WHERE status IN ('error','timeout')) AS errs,
       COUNT(*) AS total
FROM traces
WHERE ts > NOW() - INTERVAL '6 hours'
GROUP BY department_id, bucket
HAVING COUNT(*) >= 20
   AND COUNT(*) FILTER (WHERE status IN ('error','timeout'))::float / COUNT(*) > 0.2
ORDER BY bucket DESC;
"""


def _sev(score: float) -> str:
    if score >= 0.8:
        return "critical"
    if score >= 0.5:
        return "warn"
    return "info"


def detect_and_persist() -> dict:
    found = {"latency_spike": 0, "hallucination_cluster": 0, "error_burst": 0}

    for r in query(SQL_LATENCY):
        execute(
            """INSERT INTO anomalies(trace_id, kind, severity, z_score, context)
               VALUES (%s, 'latency_spike', %s, %s, %s::jsonb)""",
            (r["id"], _sev(min(1.0, r["z"] / 10.0)), r["z"],
             _json({"model": r["model"], "latency_ms": r["latency_ms"],
                    "mu": r["mu"], "sd": r["sd"]})),
        )
        found["latency_spike"] += 1

    for r in query(SQL_HALLU):
        execute(
            """INSERT INTO anomalies(kind, severity, context)
               VALUES ('hallucination_cluster', %s, %s::jsonb)""",
            (_sev(r["avg_score"]), _json(r)),
        )
        found["hallucination_cluster"] += 1

    for r in query(SQL_ERRBURST):
        rate = r["errs"] / r["total"]
        execute(
            """INSERT INTO anomalies(kind, severity, context)
               VALUES ('error_burst', %s, %s::jsonb)""",
            (_sev(rate), _json({"department_id": r["department_id"],
                                "errs": r["errs"], "total": r["total"],
                                "rate": rate, "bucket": r["bucket"]})),
        )
        found["error_burst"] += 1

    return found


def _json(obj) -> str:
    def default(o):
        try:
            return o.isoformat()
        except AttributeError:
            return str(o)
    return json.dumps(obj, default=default)
