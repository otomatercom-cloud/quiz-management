"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui";
import { Field, postJson } from "@/components/forms";
import { OtpBox } from "@/components/otp-box";
import { Turnstile } from "@/components/turnstile";
import { usePublicConfig } from "@/components/use-public-config";

/** Take an open quiz with just a name and phone number. Guests earn no XP or scholarship; an email code is asked only if staff turned it on. */
export function GuestStart({ quizId, windowOpen }: { quizId: string; windowOpen: boolean }) {
  const router = useRouter();
  const cfg = usePublicConfig();
  const [f, setF] = useState({ name: "", phone: "", email: "" });
  const [otp, setOtp] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needOtp = !!cfg?.require_email_otp;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await postJson<{ attempt_id: string }>("/api/auth/guest", { quiz_public_id: quizId, ...f, otp, turnstile: captcha });
      router.push(`/student/quiz/${r.attempt_id}`);
      router.refresh();
    } catch (err) { setError((err as Error).message); setReset((n) => n + 1); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="card w-full max-w-md space-y-3 p-5" noValidate>
      <h2 className="font-semibold">Take this quiz as a guest</h2>
      <p className="text-xs text-muted">No account needed. Create a free account to earn XP, join rooms and keep your results.</p>
      {error && <Alert>{error}</Alert>}
      <Field label="Your name"><input className="input" autoComplete="name" value={f.name} onChange={set("name")} required /></Field>
      <Field label="Mobile number"><input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} required /></Field>
      <Field label={needOtp ? "Email" : "Email (optional)"}><input className="input" type="email" autoComplete="email" value={f.email} onChange={set("email")} /></Field>
      {needOtp && <OtpBox email={f.email} purpose="guest" turnstile={captcha} onResetCaptcha={() => setReset((n) => n + 1)} value={otp} onChange={setOtp} />}
      {cfg && <Turnstile siteKey={cfg.turnstile_site_key} onToken={setCaptcha} resetKey={reset} />}
      <button className="btn-primary w-full" disabled={busy || !windowOpen || !cfg || (!!cfg.turnstile_site_key && !captcha)}>
        {busy ? "Starting…" : windowOpen ? "Start quiz" : "Quiz is not open right now"}
      </button>
    </form>
  );
}
