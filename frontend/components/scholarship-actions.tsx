"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/forms";

export function ScholarshipActions({ id, status, isAdmin }: { id: number; status: string; isAdmin: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<null | "decide" | "override">(null);
  const [ovr, setOvr] = useState("approved");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(method: string, args: unknown[]) {
    setBusy(true); setErr(null);
    try { await postJson("/api/admin/call", { model: "otm.quiz.attempt", ids: [id], method, args }); setOpen(null); setNote(""); router.refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const decidable = ["eligible", "approved", "rejected"].includes(status);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {decidable && status !== "approved" && <button className="btn-outline" disabled={busy} onClick={() => void call("decide_scholarship", ["approve", note])}>Approve</button>}
        {decidable && status !== "rejected" && <button className="btn-outline" disabled={busy} onClick={() => void call("decide_scholarship", ["reject", note])}>Reject</button>}
        {isAdmin && <button className="btn-outline" onClick={() => setOpen(open ? null : "override")}>Override</button>}
      </div>
      {open === "override" && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <select className="input" value={ovr} onChange={(e) => setOvr(e.target.value)} aria-label="New status">{["eligible", "not_eligible", "approved", "rejected"].map((x) => <option key={x}>{x}</option>)}</select>
          <textarea className="input" placeholder="Justification (required, audited)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" disabled={busy || !note.trim()} onClick={() => void call("override_scholarship", [ovr, note])}>Apply override</button>
        </div>
      )}
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
    </div>
  );
}
