import { useEffect, useState } from "react";
import { api, Anomaly } from "../api";
import { Card } from "../ui";
import { IconAlert } from "../icons";

const sevColor: Record<string, string> = {
  low: "text-muted",
  medium: "text-accent",
  high: "text-orange-400",
  critical: "text-red-400",
};

export default function Anomalies() {
  const [rows, setRows] = useState<Anomaly[] | null>(null);
  useEffect(() => {
    api.anomalies(50).then((r) => setRows(r.anomalies)).catch(console.error);
  }, []);

  return (
    <Card title="Anomalies (last 50)" icon={<IconAlert />}>
      {!rows ? (
        "Loading…"
      ) : rows.length === 0 ? (
        <div className="text-muted text-sm">No anomalies detected.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-muted font-mono text-[11px] uppercase tracking-widest">
            <tr className="border-b border-line">
              <th className="text-left py-2">When</th>
              <th className="text-left">Kind</th>
              <th className="text-left">Severity</th>
              <th className="text-right">z</th>
              <th className="text-left">Context</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-line/50">
                <td className="py-2 font-mono text-xs text-muted">
                  {a.detected_at.replace("T", " ").slice(0, 19)}
                </td>
                <td>{a.kind}</td>
                <td className={sevColor[a.severity] || ""}>{a.severity}</td>
                <td className="text-right font-mono">
                  {a.z_score?.toFixed(2) ?? "—"}
                </td>
                <td className="font-mono text-xs text-muted truncate max-w-md">
                  {JSON.stringify(a.context)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
