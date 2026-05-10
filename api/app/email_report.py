"""Send the client-generated PDF report via Resend HTTP API.

Stateless rate-limit (in-memory): N sends/hour/IP. Process-local — fine for
the single-replica demo deployment.
"""
from __future__ import annotations

import base64
import os
import re
import time
from collections import defaultdict, deque
from threading import Lock

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

RESEND_ENDPOINT = "https://api.resend.com/emails"
MAX_PDF_BYTES = 3 * 1024 * 1024  # 3 MB hard cap on attachment
RATE_LIMIT_PER_HOUR = int(os.getenv("REPORT_EMAIL_RATE_LIMIT", "3"))
WINDOW_S = 3600

_buckets: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def _client_ip(req: Request) -> str:
    fwd = req.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


def _check_rate(ip: str) -> None:
    now = time.time()
    with _lock:
        q = _buckets[ip]
        while q and now - q[0] > WINDOW_S:
            q.popleft()
        if len(q) >= RATE_LIMIT_PER_HOUR:
            retry = int(WINDOW_S - (now - q[0]))
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit reached ({RATE_LIMIT_PER_HOUR}/h). Try again in {retry}s.",
            )
        q.append(now)


_FILENAME_RE = re.compile(r"^[A-Za-z0-9._-]+\.pdf$")
_WINDOW_LABEL = {7: "Last 7 days", 30: "Last 30 days", 365: "Last 12 months"}


class ReportEmailIn(BaseModel):
    to: EmailStr
    days: int = Field(..., ge=1, le=365)
    filename: str = Field(..., max_length=80)
    pdf_base64: str = Field(..., max_length=int(MAX_PDF_BYTES * 1.4))


def _email_html(days: int, to: str) -> str:
    label = _WINDOW_LABEL.get(days, f"Last {days} days")
    return f"""\
<!doctype html>
<html><body style="margin:0;background:#f5f3ec;font-family:Helvetica,Arial,sans-serif;color:#0a1628">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ec;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #dcd8cc;border-radius:2px">
        <tr><td style="padding:28px 32px 18px 32px;border-bottom:1px solid #dcd8cc">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:#0a1628;width:22px;height:22px;border-radius:2px"></td>
            <td style="padding-left:10px;font-weight:700;font-size:15px;letter-spacing:0.5px">AEGIS</td>
            <td style="padding-left:14px;color:#5a6470;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase">AI Governance · Usage Report</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 32px 8px 32px">
          <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#0a1628">{label} · spend</div>
          <h1 style="margin:6px 0 12px 0;font-weight:700;font-size:26px;letter-spacing:-0.5px">Your Aegis report is attached.</h1>
          <p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;color:#0a1628">
            A snapshot of LLM usage, spend, and operational signals across your stack —
            generated from <a href="https://aegis.dawidc.pl" style="color:#0a1628">aegis.dawidc.pl</a>
            for the window <strong>{label.lower()}</strong>.
          </p>
          <p style="margin:0 0 18px 0;font-size:13px;line-height:1.55;color:#5a6470">
            The PDF includes hero spend, calls/tokens/latency/error-rate KPIs,
            spend by model, daily trend, spend by department, and the top use cases driving cost.
          </p>
          <a href="https://aegis.dawidc.pl" style="display:inline-block;background:#0a1628;color:#f5f3ec;padding:10px 18px;border-radius:2px;text-decoration:none;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase">Open dashboard ↗</a>
        </td></tr>
        <tr><td style="padding:18px 32px 26px 32px;border-top:1px solid #dcd8cc;color:#8b95a3;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.1em">
          Sent to {to} · <a href="https://github.com/dawidchojnacki/Aegis" style="color:#5a6470">github.com/dawidchojnacki/Aegis</a>
        </td></tr>
      </table>
      <div style="margin-top:14px;color:#8b95a3;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.12em">
        Aegis · portfolio demo by <a href="https://dawidc.pl" style="color:#5a6470">dawidc.pl</a>
      </div>
    </td></tr>
  </table>
</body></html>"""


async def send_report_email(req: Request, body: ReportEmailIn) -> dict:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(503, "Email transport not configured (RESEND_API_KEY missing).")

    if not _FILENAME_RE.match(body.filename):
        raise HTTPException(400, "Invalid filename.")
    if body.days not in (7, 30, 365):
        raise HTTPException(400, "Unsupported window — must be 7, 30, or 365.")

    try:
        raw = base64.b64decode(body.pdf_base64, validate=True)
    except Exception:
        raise HTTPException(400, "Invalid base64 payload.")
    if not (raw.startswith(b"%PDF-") and len(raw) <= MAX_PDF_BYTES):
        raise HTTPException(400, "Payload is not a valid PDF or exceeds 3 MB.")

    ip = _client_ip(req)
    _check_rate(ip)

    sender = os.getenv("REPORT_FROM_EMAIL", "Aegis <onboarding@resend.dev>")
    label = _WINDOW_LABEL.get(body.days, f"Last {body.days} days")
    payload = {
        "from": sender,
        "to": [body.to],
        "subject": f"Aegis · {label} usage report",
        "html": _email_html(body.days, body.to),
        "attachments": [{"filename": body.filename, "content": body.pdf_base64}],
    }

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            RESEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if r.status_code >= 400:
        # Roll back the rate-limit slot — the send failed, don't penalise.
        with _lock:
            q = _buckets.get(ip)
            if q:
                try:
                    q.pop()
                except IndexError:
                    pass
        detail = r.text[:240]
        raise HTTPException(status_code=502, detail=f"Email provider error: {detail}")

    return {"ok": True, "id": r.json().get("id")}
