import { ReactNode } from "react";

export function Card({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-panel border border-line rounded-sm p-4 ${className}`}
    >
      {title && (
        <header className="flex items-baseline justify-between mb-3 pb-2 border-b border-line">
          <div className="flex items-center gap-2 text-ink">
            {icon}
            <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink">
              {title}
            </h2>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  unit,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-dim">
        {label}
      </div>
      <div
        className={`mt-1 tnum tracking-tightest ${
          emphasis
            ? "font-head font-semibold text-4xl text-accent"
            : "font-head font-medium text-2xl text-ink"
        }`}
      >
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-dim tracking-normal">
            {unit}
          </span>
        )}
      </div>
      {hint && <div className="text-[10px] text-dim mt-1 font-mono">{hint}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger";
}) {
  const tones = {
    neutral: "bg-panel2 text-ink border-line",
    accent: "bg-accent/10 text-accent border-accent/30",
    danger: "bg-danger/10 text-danger border-danger/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export type WindowDays = 7 | 30 | 365;

const WINDOW_OPTS: { v: WindowDays; label: string }[] = [
  { v: 7, label: "7D" },
  { v: 30, label: "30D" },
  { v: 365, label: "1Y" },
];

export function WindowSwitch({
  value,
  onChange,
}: {
  value: WindowDays;
  onChange: (d: WindowDays) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 bg-panel border border-line rounded-sm p-0.5">
      {WINDOW_OPTS.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1 rounded-sm font-mono text-[10px] uppercase tracking-[0.18em] transition-all ${
            value === o.v
              ? "bg-ink text-bg"
              : "text-dim hover:text-ink hover:bg-panel2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const fmtCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}
export function fmtCompactNum(n: number) {
  return fmtCompact.format(n);
}
export function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`;
}
export function fmtMs(n: number) {
  return `${Math.round(n)} ms`;
}
