-- AEGIS — AI Enterprise Governance & Insight System
-- Schema v1: traces, departments, evaluations, anomalies, benchmarks

CREATE TABLE IF NOT EXISTS departments (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  cost_center  TEXT NOT NULL,
  head_count   INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS use_cases (
  id            SERIAL PRIMARY KEY,
  department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  criticality   TEXT NOT NULL CHECK (criticality IN ('low','medium','high','critical')),
  UNIQUE(department_id, name)
);

CREATE TABLE IF NOT EXISTS traces (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  department_id   INT  NOT NULL REFERENCES departments(id),
  use_case_id     INT  NOT NULL REFERENCES use_cases(id),
  user_email      TEXT NOT NULL,
  model           TEXT NOT NULL,            -- e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet
  provider        TEXT NOT NULL,            -- openrouter, direct
  prompt          TEXT NOT NULL,
  response        TEXT NOT NULL,
  prompt_tokens   INT  NOT NULL,
  completion_tokens INT NOT NULL,
  total_tokens    INT  GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  cost_usd        NUMERIC(10,6) NOT NULL,
  latency_ms      INT  NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('ok','error','timeout','filtered')),
  error_msg       TEXT,
  -- quality signals (computed on ingest by analytics worker)
  hallucination_score NUMERIC(4,3),       -- 0..1, higher = more suspicious
  toxicity_score      NUMERIC(4,3),
  refusal             BOOLEAN DEFAULT FALSE,
  -- raw metadata
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_traces_ts ON traces(ts DESC);
CREATE INDEX idx_traces_dept_ts ON traces(department_id, ts DESC);
CREATE INDEX idx_traces_model ON traces(model);
CREATE INDEX idx_traces_status ON traces(status) WHERE status <> 'ok';

CREATE TABLE IF NOT EXISTS anomalies (
  id            BIGSERIAL PRIMARY KEY,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  trace_id      BIGINT REFERENCES traces(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,            -- latency_spike, cost_outlier, hallucination, refusal_storm, error_burst
  severity      TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  z_score       NUMERIC(6,3),
  context       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_anomalies_detected ON anomalies(detected_at DESC);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  name         TEXT NOT NULL,
  use_case_id  INT REFERENCES use_cases(id),
  prompt_set   JSONB NOT NULL,             -- array of prompts
  models       TEXT[] NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed'))
);

CREATE TABLE IF NOT EXISTS benchmark_results (
  id              BIGSERIAL PRIMARY KEY,
  run_id          BIGINT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  prompt_idx      INT  NOT NULL,
  response        TEXT NOT NULL,
  latency_ms      INT  NOT NULL,
  cost_usd        NUMERIC(10,6) NOT NULL,
  quality_score   NUMERIC(4,3),    -- 0..1 from judge LLM
  judge_rationale TEXT,
  prompt_tokens   INT NOT NULL,
  completion_tokens INT NOT NULL
);

CREATE INDEX idx_benchmark_results_run ON benchmark_results(run_id);

-- Materialized rollup for fast dashboard reads
CREATE OR REPLACE VIEW v_daily_cost AS
SELECT
  date_trunc('day', ts) AS day,
  department_id,
  model,
  COUNT(*)             AS calls,
  SUM(total_tokens)    AS tokens,
  SUM(cost_usd)        AS cost,
  AVG(latency_ms)      AS avg_latency_ms,
  AVG(hallucination_score) AS avg_hallucination
FROM traces
GROUP BY 1, 2, 3;
