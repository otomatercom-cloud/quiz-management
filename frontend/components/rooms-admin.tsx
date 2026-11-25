"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton, Field, postJson } from "@/components/forms";
import { Alert, Badge } from "@/components/ui";

export type RoomRow = {
  id: number; name: string; parent_id: [number, string] | false; access_mode: string; member_count: number;
  description: string | false; color: string | false; teacher_ids: number[]; quiz_ids: number[]; active: boolean;
};
type Opt = { id: number; name: string };
type Member = { id: number; student_id: [number, string]; state: string };
type Draft = { id?: number; name: string; parent_id: number | ""; access_mode: string; color: string; description: string; teacher_ids: number[]; quiz_ids: number[] };

const blank: Draft = { name: "", parent_id: "", access_mode: "open", color: "#1D4ED8", description: "", teacher_ids: [], quiz_ids: [] };
const toggle = (a: number[], id: number) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]);

export function RoomsAdmin({ rooms, quizzes, teachers, canManage }: { rooms: RoomRow[]; quizzes: Opt[]; teachers: Opt[] | null; canManage: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [post, setPost] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const classRooms = rooms.filter((r) => !r.parent_id);

  async function save() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    try {
      const vals: Record<string, unknown> = {
        name: draft.name, parent_id: draft.parent_id || false, access_mode: draft.access_mode, color: draft.color,
        description: draft.description, quiz_ids: [[6, 0, draft.quiz_ids]],
        ...(teachers ? { teacher_ids: [[6, 0, draft.teacher_ids]] } : {}),
      };
      if (draft.id) await postJson("/api/admin/write", { model: "otm.quiz.room", ids: [draft.id], vals });
      else await postJson("/api/admin/create", { model: "otm.quiz.room", vals });
      setDraft(null); router.refresh();
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(false); }
  }

  async function showMembers(id: number) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setMembers([]);
    await loadMembers(id);
  }

  async function loadMembers(id: number) {
    try {
      const r = await postJson<{ records: Member[] }>("/api/admin/search", { model: "otm.quiz.room.member", domain: [["room_id", "=", id]], fields: ["student_id", "state"], limit: 200, order: "state desc, id desc" });
      setMembers(r.records);
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); }
  }

  async function act(ids: number[], method: "action_approve" | "action_reject", roomId: number) {
    try { await postJson("/api/admin/call", { model: "otm.quiz.room.member", ids, method }); await loadMembers(roomId); router.refresh(); }
    catch (e) { setMsg({ tone: "error", text: (e as Error).message }); }
  }

  async function publish(roomId: number) {
    setBusy(true); setMsg(null);
    try { await postJson("/api/admin/create", { model: "otm.quiz.room.post", vals: { room_id: roomId, body: post } }); setPost(""); setMsg({ tone: "success", text: "Announcement posted." }); }
    catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {canManage && !draft && <button className="btn-primary" onClick={() => setDraft({ ...blank })}>New room</button>}

      {draft && (
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">{draft.id ? "Edit room" : "New room"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room name"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="10th Standard" /></Field>
            <Field label="Type" hint="Choose a class room to make this a subject room inside it.">
              <select className="input" value={draft.parent_id} onChange={(e) => setDraft({ ...draft, parent_id: e.target.value ? Number(e.target.value) : "" })}>
                <option value="">Class room (top level)</option>
                {classRooms.filter((c) => c.id !== draft.id).map((c) => <option key={c.id} value={c.id}>Subject room in {c.name}</option>)}
              </select>
            </Field>
            <Field label="Who can join">
              <select className="input" value={draft.access_mode} onChange={(e) => setDraft({ ...draft, access_mode: e.target.value })}>
                <option value="open">Open: students join instantly</option>
                <option value="approval">Approval: join requests need approval</option>
                <option value="invite">Invite only: staff add members</option>
              </select>
            </Field>
            <Field label="Banner colour"><input type="color" className="h-10 w-20 rounded border border-slate-300" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></Field>
          </div>
          <Field label="Description"><textarea className="input" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          {teachers && (
            <fieldset><legend className="label">Teachers / moderators (can post announcements)</legend>
              <div className="flex flex-wrap gap-3">{teachers.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.teacher_ids.includes(t.id)} onChange={() => setDraft({ ...draft, teacher_ids: toggle(draft.teacher_ids, t.id) })} />{t.name}</label>)}
                {!teachers.length && <p className="text-sm text-muted">Add teachers first from the Teachers page.</p>}</div></fieldset>
          )}
          <fieldset><legend className="label">Quizzes in this room (members only)</legend>
            <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">{quizzes.map((q) => <label key={q.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.quiz_ids.includes(q.id)} onChange={() => setDraft({ ...draft, quiz_ids: toggle(draft.quiz_ids, q.id) })} />{q.name}</label>)}
              {!quizzes.length && <p className="text-sm text-muted">No quizzes yet.</p>}</div></fieldset>
          <div className="flex gap-2"><button className="btn-primary" disabled={busy || draft.name.trim().length < 2} onClick={save}>{busy ? "Saving…" : "Save room"}</button><button className="btn-outline" onClick={() => setDraft(null)}>Cancel</button></div>
        </section>
      )}

      <div className="space-y-3">
        {rooms.map((r) => (
          <article key={r.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-8 w-8 rounded-lg" style={{ background: r.color || "#1D4ED8" }} aria-hidden />
              <div className="min-w-0 flex-1"><p className="font-semibold">{r.parent_id ? `${r.parent_id[1]} › ` : ""}{r.name}</p>
                <p className="text-xs text-muted">{r.member_count} members · {r.quiz_ids.length} quizzes · {r.access_mode}</p></div>
              {!r.active && <Badge value="archived" />}
              <button className="btn-outline" onClick={() => showMembers(r.id)}>{open === r.id ? "Hide" : "Members & posts"}</button>
              {canManage && <button className="btn-outline" onClick={() => setDraft({ id: r.id, name: r.name, parent_id: r.parent_id ? r.parent_id[0] : "", access_mode: r.access_mode, color: r.color || "#1D4ED8", description: r.description || "", teacher_ids: r.teacher_ids, quiz_ids: r.quiz_ids })}>Edit</button>}
              {canManage && <ActionButton url="/api/admin/delete" body={{ model: "otm.quiz.room", ids: [r.id] }} label="Delete" variant="danger" confirm="Delete this room? Its subject rooms, memberships and announcements are removed too. Quizzes are kept." />}
            </div>
            {open === r.id && (
              <div className="space-y-4 border-t border-slate-100 pt-3">
                <div className="space-y-2">
                  <label className="label" htmlFor={`post-${r.id}`}>Post an announcement</label>
                  <textarea id={`post-${r.id}`} className="input" rows={2} maxLength={2000} value={post} onChange={(e) => setPost(e.target.value)} />
                  <button className="btn-primary" disabled={busy || post.trim().length < 2} onClick={() => publish(r.id)}>Post</button>
                </div>
                <div>
                  <p className="label">Members</p>
                  {members.length ? (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {members.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span>{m.student_id[1]} <Badge value={m.state === "approved" ? "confirmed" : m.state} label={m.state} /></span>
                          {canManage && (
                            <span className="flex gap-2">
                              {m.state !== "approved" && <button className="btn-outline" onClick={() => act([m.id], "action_approve", r.id)}>Approve</button>}
                              {m.state !== "rejected" && <button className="btn-outline" onClick={() => act([m.id], "action_reject", r.id)}>Reject</button>}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">No members yet.</p>}
                </div>
              </div>
            )}
          </article>
        ))}
        {!rooms.length && <p className="card p-6 text-center text-sm text-muted">No rooms yet. Create a class room such as &quot;10th Standard&quot;, then add subject rooms inside it.</p>}
      </div>
    </div>
  );
}
