"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge } from "@/components/ui";
import { postJson } from "@/components/forms";

export type QRow = { id: number; question_text: string; question_type: string; subject: string | false; topic: string | false; difficulty: string; marks: number; usage_count: number; active: boolean; create_uid: [number, string] | false };

export function QuestionTable({ rows, showAuthor }: { rows: QRow[]; showAuthor: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const archived = rows.length > 0 && rows.every((r) => !r.active);
  const all = rows.length > 0 && sel.length === rows.length;
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function bulk() {
    setBusy(true); setErr(null);
    try {
      await postJson("/api/admin/call", { model: "otm.quiz.question", ids: sel, method: archived ? "action_activate_selected" : "action_archive_selected" });
      setSel([]); router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${sel.length} question(s) permanently? Questions used in quizzes cannot be deleted (archive them instead).`)) return;
    setBusy(true); setErr(null);
    try { await postJson("/api/admin/delete", { model: "otm.quiz.question", ids: sel }); setSel([]); router.refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {err && <Alert>{err}</Alert>}
      {sel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-light p-3 text-sm">
          <span>{sel.length} selected</span>
          <button className="btn-outline" disabled={busy} onClick={() => void bulk()}>{archived ? "Restore" : "Archive"}</button>
          <button className="btn-danger" disabled={busy} onClick={() => void remove()}>Delete</button>
          <button className="text-primary" onClick={() => setSel([])}>Clear</button>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-muted"><tr>
            <th className="p-3"><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} /></th>
            <th className="p-3">Question</th><th className="p-3">Type</th><th className="p-3">Subject / topic</th><th className="p-3">Level</th><th className="p-3">Marks</th><th className="p-3">Used</th>
            {showAuthor && <th className="p-3">Author</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="p-6 text-muted" colSpan={8}>No questions found.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3"><input type="checkbox" aria-label={`Select question ${r.id}`} checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="max-w-md p-3"><Link className="line-clamp-2 text-primary" href={`/admin/questions/${r.id}`}>{r.question_text}</Link></td>
                <td className="p-3"><Badge value={r.question_type} /></td>
                <td className="p-3 text-xs">{r.subject || "—"}{r.topic ? ` / ${r.topic}` : ""}</td>
                <td className="p-3">{r.difficulty}</td><td className="p-3">{r.marks}</td><td className="p-3">{r.usage_count}</td>
                {showAuthor && <td className="p-3 text-xs">{r.create_uid ? r.create_uid[1] : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
