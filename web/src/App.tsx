import { useState } from "react";
import Overview from "./views/Overview";
import Cost from "./views/Cost";
import Anomalies from "./views/Anomalies";
import Weekly from "./views/Weekly";

type Tab = "overview" | "cost" | "anomalies" | "weekly";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "cost", label: "Cost" },
  { id: "anomalies", label: "Anomalies" },
  { id: "weekly", label: "Weekly" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-full max-w-6xl mx-auto px-6 py-4">
      <header className="flex items-center justify-between mb-4 pb-3 border-b border-line">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-sm bg-ink flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1L14 4v5c0 3.5-2.5 5.5-6 6-3.5-.5-6-2.5-6-6V4l6-3z"
                stroke="#f5f3ec"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="font-head font-semibold text-base tracking-tightest text-ink leading-none">
            Aegis
          </h1>
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim border-l border-line pl-2.5 ml-1">
            AI Governance Platform
          </span>
        </div>
        <div className="flex items-center gap-3">
          <nav className="flex gap-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-2.5 py-1 rounded-sm font-mono text-[10px] uppercase tracking-[0.18em] transition-all ${
                  tab === t.id
                    ? "bg-ink text-bg"
                    : "text-dim hover:text-ink hover:bg-panel"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <span className="flex items-center gap-1.5 text-[10px] text-dim font-mono uppercase tracking-wider border-l border-line pl-3">
            <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
            live
          </span>
          <a
            href="https://dawidc.pl"
            className="font-mono text-[10px] uppercase tracking-wider text-ink hover:text-accent transition-colors"
          >
            dawidc.pl ↗
          </a>
        </div>
      </header>

      {tab === "overview" && <Overview />}
      {tab === "cost" && <Cost />}
      {tab === "anomalies" && <Anomalies />}
      {tab === "weekly" && <Weekly />}

      <footer className="mt-4 pt-3 border-t border-line flex items-center justify-between text-[10px] text-dim font-mono">
        <span>v0.1.0 · FastAPI + Postgres + React</span>
        <a href="https://github.com/" className="hover:text-accent">
          source ↗
        </a>
      </footer>
    </div>
  );
}
