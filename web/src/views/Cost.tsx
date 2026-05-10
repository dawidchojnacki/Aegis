import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { api, CostBreakdown } from "../api";
import { Card, fmtUsd, fmtNum, WindowSwitch, WindowDays } from "../ui";
import { IconCoin, IconChart } from "../icons";

export default function Cost() {
  const [days, setDays] = useState<WindowDays>(7);
  const [data, setData] = useState<CostBreakdown | null>(null);
  useEffect(() => {
    setData(null);
    api.costBreakdown(days).then(setData).catch(console.error);
  }, [days]);

  const daily = (data?.daily ?? []).map((d) => ({
    ...d,
    day: d.day.slice(5, 10),
  }));

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <WindowSwitch value={days} onChange={setDays} />
      </div>
      {!data ? (
        <Card title="Cost">Loading…</Card>
      ) : (
      <>
      <Card title="Daily spend" icon={<IconChart />}>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={daily}>
              <CartesianGrid stroke="#1a1a22" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="#8a8a99"
                tick={{ fontSize: 11 }}
                interval={days === 365 ? 30 : "preserveStartEnd"}
              />
              <YAxis stroke="#8a8a99" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#0c0c11", border: "1px solid #1a1a22" }}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#c8ff47"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Spend by department" icon={<IconCoin />}>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={data.by_department} layout="vertical">
              <CartesianGrid stroke="#1a1a22" horizontal={false} />
              <XAxis type="number" stroke="#8a8a99" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="department"
                stroke="#8a8a99"
                tick={{ fontSize: 11 }}
                width={120}
              />
              <Tooltip
                contentStyle={{ background: "#0c0c11", border: "1px solid #1a1a22" }}
              />
              <Bar dataKey="cost" fill="#c8ff47" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Top use cases">
        <table className="w-full text-sm">
          <thead className="text-muted font-mono text-[11px] uppercase tracking-widest">
            <tr className="border-b border-line">
              <th className="text-left py-2">Department</th>
              <th className="text-left">Use case</th>
              <th className="text-left">Criticality</th>
              <th className="text-right">Calls</th>
              <th className="text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.by_use_case.slice(0, 12).map((r, i) => (
              <tr key={i} className="border-b border-line/50">
                <td className="py-2">{r.department}</td>
                <td>{r.use_case}</td>
                <td className="font-mono text-xs text-muted">{r.criticality}</td>
                <td className="text-right">{fmtNum(r.calls)}</td>
                <td className="text-right">{fmtUsd(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      </>
      )}
    </div>
  );
}
