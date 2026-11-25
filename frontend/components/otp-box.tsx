"use client";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui";
import { Field, postJson } from "@/components/forms";

/** "Send code" + 6-digit input. The code itself is validated by Odoo on submit; this only asks for it. */
export function OtpBox({ email, purpose, turnstile, onResetCaptcha, value, onChange }: {
  email: string; purpose: "register" | "guest"; turnstile: string; onResetCaptcha: () => void; value: string; onChange: (v: string) => void;
}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const valid = /^\S+@\S+\.\S+$/.test(email);
  async function send() {
    setBusy(true); setErr(null);
    try { await postJson("/api/auth/otp", { email, purpose, turnstile }); setSent(true); setWait(60); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); onResetCaptcha(); }
  }
  return (
    <div className="space-y-2 rounded-lg bg-blue-50 p-3">
      {err && <Alert>{err}</Alert>}
      <button type="button" className="btn-outline w-full" disabled={busy || wait > 0 || !valid} onClick={send}>
        {busy ? "Sending…" : wait > 0 ? `Resend in ${wait}s` : sent ? "Send a new code" : "Email me a verification code"}
      </button>
      {sent && <p className="text-xs text-muted">We sent a 6-digit code to {email}. It is valid for 10 minutes.</p>}
      <Field label="Verification code">
        <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
      </Field>
    </div>
  );
}
