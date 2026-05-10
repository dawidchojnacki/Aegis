export type Totals = {
  calls: number;
  cost: number;
  tokens: number;
  avg_latency: number;
  avg_hallucination: number | null;
  errors: number;
};

export type ByModel = {
  model: string;
  calls: number;
  cost: number;
  avg_latency: number;
};

export type Summary = {
  window_days: number;
  totals: Totals;
  by_model: ByModel[];
};

export type CostBreakdown = {
  by_department: {
    department: string;
    cost_center: string;
    calls: number;
    cost: number;
    tokens: number;
  }[];
  by_use_case: {
    department: string;
    use_case: string;
    criticality: string;
    calls: number;
    cost: number;
  }[];
  daily: { day: string; cost: number; calls: number }[];
};

export type Anomaly = {
  id: number;
  detected_at: string;
  trace_id: number | null;
  kind: string;
  severity: string;
  z_score: number | null;
  context: Record<string, unknown>;
};

export type WeeklyReport = { markdown: string; generated_at: string };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail ?? j.message ?? text;
    } catch {}
    throw new Error(`${r.status}: ${detail}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export const api = {
  summary: (days = 7) => get<Summary>(`/v1/summary?days=${days}`),
  costBreakdown: (days = 7) => get<CostBreakdown>(`/v1/cost-breakdown?days=${days}`),
  anomalies: (limit = 100) => get<{ anomalies: Anomaly[] }>(`/v1/anomalies?limit=${limit}`),
  weekly: () => get<WeeklyReport>(`/v1/report/weekly`),
  emailReport: (payload: { to: string; days: number; filename: string; pdf_base64: string }) =>
    postJson<{ ok: boolean; id?: string }>(`/v1/report/email`, payload),
};
