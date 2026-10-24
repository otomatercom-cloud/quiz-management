"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/forms";

export function GradeForm({ answerId, max, marks, feedback }: { answerId: number; max: number; marks: number; feedback: string }) {
  const router = useRouter();
  const [m, setM] = useState(String(marks));
  const [fb, setFb] = useState(feedback);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr(null);
    try { await postJson("/api/admin/call", { model: "otm.quiz.attempt.answer", ids: [answerId], method: "grade_descriptive", args: [Number(m), fb] }); router.refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-sm">Marks (0–{max})<input type="number" min={0} max={max} step="0.25" className="input mt-1 w-28" value={m} onChange={(e) => setM(e.target.value)} /></label>
      <label className="min-w-60 flex-1 text-sm">Feedback<input className="input mt-1" value={fb} onChange={(e) => setFb(e.target.value)} /></label>
      <button className="btn-primary" disabled={busy || m === "" || Number(m) < 0 || Number(m) > max} onClick={() => void save()}>{busy ? "Saving…" : "Save grade"}</button>
      {err && <p className="basis-full text-sm text-bad" role="alert">{err}</p>}
    </div>
  );
}
