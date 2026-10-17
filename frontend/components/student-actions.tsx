"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui";
import { ActionButton, ConfirmDialog, postJson } from "@/components/forms";

export function RegisterQuizButton({ quizId, open, required }: { quizId: string; open: boolean; required: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!required) return <Alert tone="info">No registration is needed — start from your quiz list when the window opens.</Alert>;
  return (
    <div className="space-y-3">
      <button className="btn-primary" disabled={!open || busy} onClick={async () => {
        setBusy(true);
        try { await postJson("/api/student/register_quiz", { quiz_public_id: quizId }); setMsg({ tone: "success", text: "You are registered for this quiz." }); router.refresh(); }
        catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(false); }
      }}>{busy ? "Registering…" : open ? "Register for this quiz" : "Registration closed"}</button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

export function StartQuizButton({ quizId, resume, duration }: { quizId: string; resume?: boolean; duration?: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  async function start() {
    setBusy(true); setError(null);
    try {
      const r = await postJson<{ attempt_id: string }>("/api/student/start_attempt", { quiz_public_id: quizId });
      router.push(`/student/quiz/${r.attempt_id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <button className="btn-primary" disabled={busy} onClick={() => (resume ? start() : setAsking(true))}>
        {busy ? "Starting…" : resume ? "Resume quiz" : "Start quiz"}
      </button>
      {error && !asking && <p className="text-sm text-bad" role="alert">{error}</p>}
      {asking && (
        <ConfirmDialog title="Ready to start?" confirmLabel="Start now" busy={busy} error={error}
          text={`The timer${duration ? ` (${duration} minutes)` : ""} starts immediately and runs on the server — it cannot be paused. Your answers save automatically and you can resume after a refresh until time runs out.`}
          onCancel={() => { setAsking(false); setError(null); }} onConfirm={start} />
      )}
    </div>
  );
}

export function CancelRegistrationButton({ id }: { id: string }) {
  return <ActionButton url="/api/student/cancel_registration" body={{ registration_public_id: id }} label="Cancel registration"
    confirm="Cancel this registration? You can register again while registration is open." variant="danger" />;
}
