"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui";
import { Field, postJson } from "@/components/forms";

export type Teacher = { id: number; name: string; login: string; email: string; active: boolean; questions: number };

export function TeachersClient({ teachers }: { teachers: Teacher[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true); setMsg(null);
    try {
      const r = await postJson<{ created: boolean; emailed: boolean }>("/api/admin/teacher-create", { ...f, password: f.password || "" });
      setMsg({ tone: "success", text: r.created ? (r.emailed ? "Teacher added. A password-setup link was emailed (if mail is configured; otherwise set a password)." : "Teacher added with the password you set.") : "Existing Odoo user now has the Teacher role." });
      setF({ name: "", email: "", password: "" }); router.refresh();
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(false); }
  }
  async function toggle(t: Teacher) {
    setBusy(true); setMsg(null);
    try { await postJson("/api/admin/teacher-active", { user_id: t.id, active: !t.active }); router.refresh(); }
    catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="card max-w-3xl space-y-4 p-6">
        <h2 className="font-semibold">Add a teacher</h2>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email (login)"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Password (optional)" hint="Leave blank to email a setup link"><input type="password" autoComplete="new-password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        </div>
        <button className="btn-primary" disabled={busy || f.name.trim().length < 2 || !f.email} onClick={() => void add()}>{busy ? "Working…" : "Add teacher"}</button>
        <p className="text-xs text-muted">Teachers can add, edit and import <em>their own</em> questions only. They cannot create quizzes or see students, results or other teachers&apos; questions.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-muted"><tr><th className="p-3">Name</th><th className="p-3">Login</th><th className="p-3">Questions</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
          <tbody>
            {teachers.length === 0 && <tr><td className="p-4 text-muted" colSpan={5}>No teachers yet.</td></tr>}
            {teachers.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="p-3">{t.name}</td><td className="p-3">{t.login}</td><td className="p-3">{t.questions}</td>
                <td className="p-3">{t.active ? <span className="text-ok">Active</span> : <span className="text-muted">Inactive</span>}</td>
                <td className="p-3 text-right"><button className="btn-outline" disabled={busy} onClick={() => void toggle(t)}>{t.active ? "Deactivate" : "Activate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
