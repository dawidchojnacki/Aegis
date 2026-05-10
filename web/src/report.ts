import { jsPDF } from "jspdf";
import { api, Summary, CostBreakdown } from "./api";
import { WindowDays } from "./ui";

const INK = "#0a1628";
const DIM = "#5a6470";
const MUTED = "#8b95a3";
const ACCENT = "#0a1628";
const BAR = "#0a1628";
const BAR_LIGHT = "#3a5a85";
const LINE = "#dcd8cc";
const PAPER = "#f5f3ec";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const COL_W = PAGE_W - MARGIN * 2;

const WINDOW_LABEL: Record<WindowDays, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  365: "Last 12 months",
};

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const shortModel = (m: string) => m.split("/").pop() ?? m;

function setFill(pdf: jsPDF, hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  pdf.setFillColor(r, g, b);
}
function setDraw(pdf: jsPDF, hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  pdf.setDrawColor(r, g, b);
}
function setText(pdf: jsPDF, hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  pdf.setTextColor(r, g, b);
}

function paperBg(pdf: jsPDF) {
  setFill(pdf, PAPER);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
}

function header(pdf: jsPDF, days: WindowDays, generatedAt: Date) {
  // Shield icon
  setFill(pdf, INK);
  pdf.rect(MARGIN, MARGIN - 2, 5, 5, "F");
  setText(pdf, INK);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("AEGIS", MARGIN + 7.5, MARGIN + 1.6);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(7);
  setText(pdf, DIM);
  pdf.text("AI GOVERNANCE  ·  USAGE REPORT", MARGIN + 22, MARGIN + 1.6);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(7);
  setText(pdf, DIM);
  const stamp = `${WINDOW_LABEL[days].toUpperCase()}  ·  ${generatedAt.toISOString().slice(0, 10)} ${generatedAt.toISOString().slice(11, 16)}Z`;
  pdf.text(stamp, PAGE_W - MARGIN, MARGIN + 1.6, { align: "right" });

  setDraw(pdf, INK);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN, MARGIN + 4, PAGE_W - MARGIN, MARGIN + 4);
}

function footer(pdf: jsPDF, page: number, total: number) {
  setDraw(pdf, LINE);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN, PAGE_H - MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(7);
  setText(pdf, MUTED);
  pdf.text("aegis.dawidc.pl", MARGIN, PAGE_H - MARGIN + 4);
  pdf.text(`PAGE ${page} / ${total}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 4, { align: "right" });
  pdf.text(
    "github.com/dawidchojnacki/Aegis",
    PAGE_W / 2,
    PAGE_H - MARGIN + 4,
    { align: "center" }
  );
}

function sectionTitle(pdf: jsPDF, text: string, y: number) {
  pdf.setFont("courier", "bold");
  pdf.setFontSize(8);
  setText(pdf, INK);
  pdf.text(text.toUpperCase(), MARGIN, y);
  setDraw(pdf, INK);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
}

function kpi(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  unit?: string
) {
  pdf.setFont("courier", "normal");
  pdf.setFontSize(7);
  setText(pdf, DIM);
  pdf.text(label.toUpperCase(), x, y);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  setText(pdf, INK);
  pdf.text(value, x, y + 9);
  if (unit) {
    const valW = pdf.getTextWidth(value);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    setText(pdf, DIM);
    pdf.text(unit, x + valW + 1.5, y + 9);
  }
  setDraw(pdf, LINE);
  pdf.setLineWidth(0.2);
  pdf.line(x, y + 12, x + w - 4, y + 12);
}

function hBars(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  rows: { label: string; value: number; sub?: string }[],
  maxRows = 6
) {
  const items = rows.slice(0, maxRows);
  if (items.length === 0) return y;
  const max = Math.max(...items.map((r) => r.value));
  const rowH = 8;
  const labelW = 52;
  const valueW = 22;
  const barW = w - labelW - valueW;
  items.forEach((r, i) => {
    const yy = y + i * rowH;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    setText(pdf, INK);
    pdf.text(r.label, x, yy + 4);
    if (r.sub) {
      pdf.setFont("courier", "normal");
      pdf.setFontSize(6.5);
      setText(pdf, MUTED);
      pdf.text(r.sub.toUpperCase(), x, yy + 7);
    }
    const bw = max > 0 ? (r.value / max) * barW : 0;
    setFill(pdf, LINE);
    pdf.rect(x + labelW, yy + 1.5, barW, 4, "F");
    setFill(pdf, i === 0 ? BAR : BAR_LIGHT);
    pdf.rect(x + labelW, yy + 1.5, Math.max(0.3, bw), 4, "F");
    pdf.setFont("courier", "bold");
    pdf.setFontSize(8.5);
    setText(pdf, INK);
    pdf.text(fmtUsd(r.value), x + w, yy + 4, { align: "right" });
  });
  return y + items.length * rowH;
}

function dailyChart(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  daily: { day: string; cost: number }[]
) {
  if (daily.length === 0) return;
  const max = Math.max(...daily.map((d) => d.cost), 0.01);
  const padL = 12;
  const padR = 4;
  const padT = 4;
  const padB = 10;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  setDraw(pdf, LINE);
  pdf.setLineWidth(0.15);
  for (let g = 0; g <= 4; g++) {
    const yy = y + padT + (innerH * g) / 4;
    pdf.line(x + padL, yy, x + w - padR, yy);
    pdf.setFont("courier", "normal");
    pdf.setFontSize(6);
    setText(pdf, MUTED);
    pdf.text(`$${(max * (1 - g / 4)).toFixed(0)}`, x + padL - 1.5, yy + 1, {
      align: "right",
    });
  }
  const slot = innerW / daily.length;
  const barW = Math.max(0.6, slot * 0.7);
  daily.forEach((d, i) => {
    const bh = (d.cost / max) * innerH;
    const bx = x + padL + i * slot + (slot - barW) / 2;
    const by = y + padT + innerH - bh;
    setFill(pdf, INK);
    pdf.rect(bx, by, barW, Math.max(0.3, bh), "F");
  });
  // x axis labels: first / mid / last
  pdf.setFont("courier", "normal");
  pdf.setFontSize(6);
  setText(pdf, MUTED);
  const picks = [0, Math.floor(daily.length / 2), daily.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  picks.forEach((idx) => {
    const bx = x + padL + idx * slot + slot / 2;
    pdf.text(daily[idx].day.slice(5), bx, y + h - 2, { align: "center" });
  });
  // axis line
  setDraw(pdf, INK);
  pdf.setLineWidth(0.3);
  pdf.line(x + padL, y + padT + innerH, x + w - padR, y + padT + innerH);
}

function tableUseCases(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  rows: CostBreakdown["by_use_case"]
) {
  const cols = [
    { label: "DEPT", w: 28 },
    { label: "USE CASE", w: 70 },
    { label: "CRIT", w: 18 },
    { label: "CALLS", w: 24, align: "right" as const },
    { label: "COST", w: w - 28 - 70 - 18 - 24, align: "right" as const },
  ];
  pdf.setFont("courier", "bold");
  pdf.setFontSize(7);
  setText(pdf, DIM);
  let cx = x;
  cols.forEach((c) => {
    pdf.text(c.label, c.align === "right" ? cx + c.w - 1 : cx, y, {
      align: c.align ?? "left",
    });
    cx += c.w;
  });
  setDraw(pdf, INK);
  pdf.setLineWidth(0.3);
  pdf.line(x, y + 1.5, x + w, y + 1.5);
  let yy = y + 6;
  rows.slice(0, 14).forEach((r, i) => {
    if (i % 2 === 1) {
      setFill(pdf, "#ece8d9");
      pdf.rect(x - 1, yy - 4, w + 2, 6, "F");
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    setText(pdf, INK);
    cx = x;
    const cells = [
      r.department,
      r.use_case.length > 42 ? r.use_case.slice(0, 40) + "…" : r.use_case,
      r.criticality,
      fmtNum(r.calls),
      fmtUsd(r.cost),
    ];
    cells.forEach((val, ci) => {
      const c = cols[ci];
      if (ci === 2) {
        pdf.setFont("courier", "normal");
        pdf.setFontSize(7);
        setText(pdf, DIM);
      } else if (ci >= 3) {
        pdf.setFont("courier", "normal");
        pdf.setFontSize(8);
        setText(pdf, INK);
      } else {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        setText(pdf, INK);
      }
      pdf.text(String(val), c.align === "right" ? cx + c.w - 1 : cx, yy, {
        align: c.align ?? "left",
      });
      cx += c.w;
    });
    yy += 6;
  });
}

export async function generateReport(days: WindowDays): Promise<void> {
  const [summary, breakdown] = await Promise.all([
    api.summary(days),
    api.costBreakdown(days),
  ]);
  buildPdf(days, summary, breakdown);
}

function buildPdf(days: WindowDays, s: Summary, b: CostBreakdown) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const generatedAt = new Date();
  const totalPages = 2;

  // ── Page 1 ───────────────────────────────────────────────
  paperBg(pdf);
  header(pdf, days, generatedAt);

  // Hero
  let y = 36;
  pdf.setFont("courier", "bold");
  pdf.setFontSize(8);
  setText(pdf, ACCENT);
  pdf.text(`${WINDOW_LABEL[days].toUpperCase()}  ·  SPEND`, MARGIN, y);

  y += 14;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(54);
  setText(pdf, INK);
  const dollar = "$";
  const amount = s.totals.cost.toFixed(2);
  pdf.text(dollar + amount, MARGIN, y);
  const totW = pdf.getTextWidth(dollar + amount);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  setText(pdf, DIM);
  pdf.text("USD", MARGIN + totW + 3, y);

  y += 8;
  pdf.setFont("times", "italic");
  pdf.setFontSize(11);
  setText(pdf, DIM);
  pdf.text(
    `Across ${fmtCompact(s.totals.calls)} calls and ${fmtCompact(s.totals.tokens)} tokens — observability for next month's bill.`,
    MARGIN,
    y
  );

  // KPI row
  y += 14;
  const colW = (COL_W - 6) / 4;
  const errorRate = s.totals.calls > 0 ? (s.totals.errors / s.totals.calls) * 100 : 0;
  kpi(pdf, MARGIN, y, colW, "Calls", fmtCompact(s.totals.calls));
  kpi(pdf, MARGIN + colW + 2, y, colW, "Tokens", fmtCompact(s.totals.tokens));
  kpi(
    pdf,
    MARGIN + (colW + 2) * 2,
    y,
    colW,
    "Avg latency",
    `${Math.round(s.totals.avg_latency || 0)}`,
    "ms"
  );
  kpi(
    pdf,
    MARGIN + (colW + 2) * 3,
    y,
    colW,
    "Error rate",
    errorRate.toFixed(2),
    "%"
  );

  // Spend by model
  y += 22;
  sectionTitle(pdf, "Spend by model", y);
  y += 6;
  const modelRows = s.by_model.map((m) => ({
    label: shortModel(m.model),
    value: m.cost,
    sub: `${m.model.split("/")[0]} · ${fmtCompact(m.calls)} calls · ${Math.round(m.avg_latency)} ms`,
  }));
  hBars(pdf, MARGIN, y, COL_W, modelRows, 6);

  // Daily spend chart
  y += Math.min(6, modelRows.length) * 8 + 8;
  sectionTitle(pdf, "Daily spend", y);
  y += 4;
  dailyChart(pdf, MARGIN, y, COL_W, 56, b.daily);

  footer(pdf, 1, totalPages);

  // ── Page 2 ───────────────────────────────────────────────
  pdf.addPage();
  paperBg(pdf);
  header(pdf, days, generatedAt);

  y = 36;
  sectionTitle(pdf, "Spend by department", y);
  y += 6;
  const deptRows = b.by_department.map((d) => ({
    label: d.department,
    value: d.cost,
    sub: `${d.cost_center} · ${fmtCompact(d.calls)} calls · ${fmtCompact(d.tokens)} tokens`,
  }));
  hBars(pdf, MARGIN, y, COL_W, deptRows, 8);

  y += Math.min(8, deptRows.length) * 8 + 8;
  sectionTitle(pdf, "Top use cases", y);
  y += 6;
  tableUseCases(pdf, MARGIN, y, COL_W, b.by_use_case);

  // Closing note
  pdf.setFont("times", "italic");
  pdf.setFontSize(9);
  setText(pdf, DIM);
  pdf.text(
    `Generated ${generatedAt.toISOString().replace("T", " ").slice(0, 16)}Z from aegis.dawidc.pl  ·  source: github.com/dawidchojnacki/Aegis`,
    MARGIN,
    PAGE_H - MARGIN - 4
  );

  footer(pdf, 2, totalPages);

  const stamp = generatedAt.toISOString().slice(0, 10);
  pdf.save(`aegis-report-${days}d-${stamp}.pdf`);
}
