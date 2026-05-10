import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { buildReportPayload } from "./report";
import { WindowDays } from "./ui";

const WINDOW_LABEL: Record<WindowDays, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  365: "Last 12 months",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Phase = "idle" | "building" | "sending" | "sent" | "error";

export default function EmailReportModal({
  open,
  days,
  onClose,
}: {
  open: boolean;
  days: WindowDays;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPhase("idle");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "sending" && phase !== "building") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, onClose]);

  if (!open) return null;

  const valid = EMAIL_RE.test(email.trim());
  const busy = phase === "building" || phase === "sending";

  const onSend = async () => {
    if (!valid || busy) return;
    setError(null);
    try {
      setPhase("building");
      const { filename, base64 } = await buildReportPayload(days);
      setPhase("sending");
      await api.emailReport({ to: email.trim(), days, filename, pdf_base64: base64 });
      setPhase("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-bg/85 backdrop-blur-sm transition-opacity"
      />
      <div className="relative w-full max-w-md bg-panel border border-line rounded-sm shadow-2xl shadow-black/50 animate-[fadeUp_180ms_ease-out]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="1.5" y="3" width="13" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" className="text-accent" />
              <path d="M2 4l6 5 6-5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" className="text-accent" />
            </svg>
            <h2 id="email-modal-title" className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink">
              Send report by email
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            className="text-dim hover:text-ink disabled:opacity-30 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="font-serif italic text-sm text-dim leading-snug mb-4">
            We'll generate a fresh PDF — <span className="text-ink not-italic font-body">{WINDOW_LABEL[days].toLowerCase()}</span> — and deliver it to your inbox.
          </p>

          {phase === "sent" ? (
            <div className="border border-accent/40 bg-accent/5 rounded-sm px-4 py-4">
              <div className="flex items-center gap-2 text-accent font-mono text-[10px] uppercase tracking-[0.18em] mb-1.5">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3 3 7-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sent
              </div>
              <div className="text-sm text-ink">
                Report on its way to <span className="font-mono text-[12px]">{email}</span>.
              </div>
              <div className="text-[11px] text-dim mt-1">
                Check spam if it doesn't arrive in a minute.
              </div>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-dim">Recipient</span>
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (phase === "error") setPhase("idle");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && onSend()}
                  placeholder="you@example.com"
                  disabled={busy}
                  spellCheck={false}
                  autoComplete="email"
                  className="mt-1.5 w-full bg-bg border border-line focus:border-accent rounded-sm px-3 py-2 font-mono text-[13px] text-ink placeholder:text-dim/60 outline-none transition-colors disabled:opacity-50"
                />
              </label>

              {error && (
                <div className="mt-3 border border-danger/40 bg-danger/5 rounded-sm px-3 py-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger mb-0.5">Failed</div>
                  <div className="text-[12px] text-ink break-words">{error}</div>
                </div>
              )}

              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-3">
                Window: {WINDOW_LABEL[days]}  ·  Limit: 3 / hour / IP
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line">
          {phase === "sent" ? (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-sm bg-ink text-bg hover:bg-accent hover:text-ink font-mono text-[10px] uppercase tracking-[0.18em] transition-all"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={busy}
                className="px-3 py-1.5 rounded-sm border border-line text-dim hover:text-ink hover:border-ink disabled:opacity-50 font-mono text-[10px] uppercase tracking-[0.18em] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={onSend}
                disabled={!valid || busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-accent text-ink hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[10px] uppercase tracking-[0.18em] transition-all"
              >
                {phase === "building" && (
                  <>
                    <Spinner /> Building PDF…
                  </>
                )}
                {phase === "sending" && (
                  <>
                    <Spinner /> Sending…
                  </>
                )}
                {(phase === "idle" || phase === "error") && (
                  <>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M2 8l12-6-4 13-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                    Send report
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
