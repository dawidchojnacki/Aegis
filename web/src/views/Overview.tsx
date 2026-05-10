import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { api, Summary } from "../api";
import { Card, Kpi, Pill, fmtCompactNum, fmtUsd, fmtMs, WindowDays } from "../ui";
import { IconPulse, IconChart } from "../icons";

const WINDOW_LABEL: Record<WindowDays, { hero: string; pill: string }> = {
  7: { hero: "Last 7 days · spend", pill: "USD · 7D" },
  30: { hero: "Last 30 days · spend", pill: "USD · 30D" },
  365: { hero: "Last year · spend", pill: "USD · 1Y" },
};

const BAR_COLORS = ["#0a1628", "#1a3d6b", "#3a5a85", "#9a6f1f", "#b8893a", "#6b6f76"];

const shortModel = (m: string) => m.split("/").pop() ?? m;

export default function Overview({ days }: { days: WindowDays }) {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    api.summary(days).then(setData).catch((e) => setErr(String(e)));
  }, [days]);

  if (err) return <Card title="Overview">Error: {err}</Card>;
  if (!data)
    return (
      <Card title="Overview">
        <div className="text-dim text-sm font-mono">Loading…</div>
      </Card>
    );

  const t = data.totals;
  const errorRate = t.calls > 0 ? (t.errors / t.calls) * 100 : 0;
  const chartData = data.by_model.map((m) => ({
    ...m,
    short: shortModel(m.model),
  }));

  return (
    <div className="grid gap-3">
      {/* Hero */}
      <Card>
        <div className="grid md:grid-cols-[1.1fr_1fr] gap-6 items-center">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent mb-1.5">
              {WINDOW_LABEL[days].hero}
            </div>
            <div className="font-head font-semibold text-6xl tracking-tightest text-ink tnum leading-none">
              <span className="text-accent">$</span>
              {t.cost.toFixed(2)}
              <span className="text-2xl text-dim ml-2 font-normal">USD</span>
            </div>
            <p className="font-serif italic text-base text-dim mt-2 max-w-md leading-snug">
              Across {fmtCompactNum(t.calls)} calls, {fmtCompactNum(t.tokens)} tokens —
              <span className="text-ink not-italic font-body">
                {" "}observability for next month's bill.
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Kpi label="Calls" value={fmtCompactNum(t.calls)} />
            <Kpi label="Tokens" value={fmtCompactNum(t.tokens)} />
            <Kpi
              label="Avg latency"
              value={`${Math.round(t.avg_latency || 0)}`}
              unit="ms"
            />
            <Kpi
              label="Error rate"
              value={errorRate.toFixed(2)}
              unit="%"
              hint={`${t.errors} of ${t.calls}`}
            />
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-3">
        {/* Spend by model */}
        <Card
          title="Spend by model"
          icon={<IconChart />}
          action={<Pill>{WINDOW_LABEL[days].pill}</Pill>}
        >
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart
                data={chartData}
                margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#dcd8cc" vertical={false} />
                <XAxis
                  dataKey="short"
                  stroke="#4b5563"
                  tick={{ fontSize: 10, fill: "#4b5563", fontFamily: "Geist Mono" }}
                  tickLine={false}
                  axisLine={{ stroke: "#0a1628" }}
                />
                <YAxis
                  stroke="#4b5563"
                  tick={{ fontSize: 10, fill: "#4b5563", fontFamily: "Geist Mono" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: "rgba(10, 22, 40, 0.06)" }}
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #0a1628",
                    borderRadius: 2,
                    fontSize: 11,
                    fontFamily: "Geist Mono",
                    boxShadow: "0 6px 16px rgba(10, 22, 40, 0.08)",
                    padding: "8px 10px",
                  }}
                  labelStyle={{
                    color: "#0a1628",
                    marginBottom: 4,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    fontSize: 10,
                  }}
                  itemStyle={{ color: "#0a1628" }}
                  formatter={(value: number, _name, ctx) => {
                    const row = ctx.payload as { calls?: number; avg_latency?: number };
                    return [
                      `$${value.toFixed(2)} · ${row.calls?.toLocaleString() ?? 0} calls · ${Math.round(row.avg_latency ?? 0)} ms`,
                      "Spend",
                    ];
                  }}
                />
                <Bar dataKey="cost" radius={[2, 2, 0, 0]} maxBarSize={48}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Per-model list */}
        <Card title="Models · breakdown" icon={<IconPulse />}>
          <div className="divide-y divide-line">
            {data.by_model.slice(0, 6).map((m) => (
              <div
                key={m.model}
                className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-ink truncate">
                    {shortModel(m.model)}
                  </div>
                  <div className="font-mono text-[9px] text-dim truncate uppercase tracking-wider">
                    {m.model.split("/")[0]} · {fmtCompactNum(m.calls)} · {fmtMs(m.avg_latency)}
                  </div>
                </div>
                <div className="font-head text-sm text-accent tnum ml-3">
                  {fmtUsd(m.cost)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
