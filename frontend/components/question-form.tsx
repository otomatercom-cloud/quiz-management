"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui";
import { Field, postJson } from "@/components/forms";

export type QOption = { id?: number; option_text: string; is_correct: boolean };
export type QDraft = {
  id?: number; question_text: string; question_type: string; subject: string; topic: string; difficulty: string;
  marks: number; negative_marks: number; explanation: string; options: QOption[]; locked?: boolean; tags: string;
};

export const blankQuestion: QDraft = {
  question_text: "", question_type: "mcq", subject: "", topic: "", difficulty: "medium", marks: 1, negative_marks: 0, explanation: "", tags: "",
  options: [{ option_text: "", is_correct: true }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }],
};

export function QuestionForm({ initial }: { initial: QDraft }) {
  const router = useRouter();
  const [q, setQ] = useState<QDraft>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof QDraft>(k: K, v: QDraft[K]) => setQ((x) => ({ ...x, [k]: v }));
  const [image, setImage] = useState<string | null | undefined>(undefined); // undefined = unchanged, null = remove
  const scored = q.question_type === "mcq" || q.question_type === "true_false";

  function setType(t: string) {
    setQ((x) => ({
      ...x, question_type: t,
      options: t === "true_false" ? [{ option_text: "True", is_correct: true }, { option_text: "False", is_correct: false }] : t === "descriptive" ? [] : x.options.length >= 2 ? x.options : blankQuestion.options,
    }));
  }
  const setOpt = (i: number, patch: Partial<QOption>) => set("options", q.options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const markCorrect = (i: number) => set("options", q.options.map((o, j) => ({ ...o, is_correct: j === i })));

  async function pickImage(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return setErr("Image must be PNG, JPG, WEBP or GIF.");
    if (file.size > 1024 * 1024) return setErr("Image must be 1 MB or smaller.");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    setErr(null); setImage(btoa(bin));
  }

  async function tagIds(): Promise<number[]> {
    const names = [...new Set(q.tags.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 20);
    const ids: number[] = [];
    for (const name of names) {
      const found = await postJson<{ records: { id: number }[] }>("/api/admin/search", { model: "otm.quiz.tag", domain: [["name", "=ilike", name]], fields: ["id"], limit: 1 });
      ids.push(found.records[0]?.id ?? (await postJson<number>("/api/admin/create", { model: "otm.quiz.tag", vals: { name } })));
    }
    return ids;
  }

  async function save() {
    setErr(null);
    if (!q.question_text.trim()) return setErr("Question text is required.");
    if (scored) {
      const opts = q.options.filter((o) => o.option_text.trim());
      if (opts.length < 2) return setErr("Add at least two options.");
      if (opts.filter((o) => o.is_correct).length !== 1) return setErr("Mark exactly one correct option.");
    }
    setBusy(true);
    try {
      const vals: Record<string, unknown> = {
        question_text: q.question_text, question_type: q.question_type, subject: q.subject || false, topic: q.topic || false,
        difficulty: q.difficulty, marks: q.marks, negative_marks: q.negative_marks, explanation: q.explanation || false,
        tag_ids: [[6, 0, await tagIds()]],
      };
      if (image !== undefined) vals.image = image ?? false;
      if (!q.locked) {
        const opts = scored ? q.options.filter((o) => o.option_text.trim()) : [];
        vals.option_ids = [[5, 0, 0], ...opts.map((o) => [0, 0, { option_text: o.option_text, is_correct: o.is_correct }])];
      }
      if (q.id) await postJson("/api/admin/write", { model: "otm.quiz.question", ids: [q.id], vals });
      else await postJson("/api/admin/create", { model: "otm.quiz.question", vals });
      router.push("/admin/question-bank"); router.refresh();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="card max-w-3xl space-y-5 p-6">
      {err && <Alert>{err}</Alert>}
      {q.locked && <Alert tone="info">This question is used by attempted quizzes, so its options are locked to protect past results. Archive it and create a new version to change the answer key.</Alert>}
      <Field label="Question"><textarea className="input min-h-24" value={q.question_text} onChange={(e) => set("question_text", e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type"><select className="input" value={q.question_type} disabled={q.locked} onChange={(e) => setType(e.target.value)}>
          <option value="mcq">MCQ</option><option value="true_false">True / False</option><option value="descriptive">Descriptive (manual grading)</option></select></Field>
        <Field label="Difficulty"><select className="input" value={q.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
          {["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Marks"><input type="number" min={0} step="0.25" className="input" value={q.marks} onChange={(e) => set("marks", Number(e.target.value))} /></Field>
        <Field label="Subject"><input className="input" value={q.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
        <Field label="Topic"><input className="input" value={q.topic} onChange={(e) => set("topic", e.target.value)} /></Field>
        <Field label="Negative marks" hint="Deducted for a wrong answer"><input type="number" min={0} step="0.25" className="input" value={q.negative_marks} onChange={(e) => set("negative_marks", Number(e.target.value))} /></Field>
      </div>
      {scored && (
        <fieldset className="space-y-2" disabled={q.locked}>
          <legend className="mb-1 text-sm font-medium">Options (select the correct one)</legend>
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={o.is_correct} onChange={() => markCorrect(i)} aria-label={`Option ${i + 1} is correct`} />
              <input className="input" value={o.option_text} readOnly={q.question_type === "true_false"} placeholder={`Option ${i + 1}`} onChange={(e) => setOpt(i, { option_text: e.target.value })} />
              {q.question_type === "mcq" && q.options.length > 2 && <button type="button" className="text-bad" onClick={() => set("options", q.options.filter((_, j) => j !== i))} aria-label="Remove option">✕</button>}
            </div>
          ))}
          {q.question_type === "mcq" && q.options.length < 8 && <button type="button" className="btn-outline" onClick={() => set("options", [...q.options, { option_text: "", is_correct: false }])}>Add option</button>}
        </fieldset>
      )}
      <Field label="Tags" hint="Comma separated, e.g. algebra, chapter 3"><input className="input" value={q.tags} onChange={(e) => set("tags", e.target.value)} /></Field>
      <Field label="Question image (optional, max 1 MB)">
        <div className="space-y-2">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void pickImage(e.target.files?.[0])} aria-label="Question image" />
          {image && <p className="text-xs text-ok">New image selected. <button type="button" className="text-bad" onClick={() => setImage(undefined)}>Undo</button></p>}
          {q.id && image === undefined && <button type="button" className="text-xs text-bad" onClick={() => setImage(null)}>Remove existing image on save</button>}
          {image === null && <p className="text-xs text-warn">Image will be removed. <button type="button" className="text-primary" onClick={() => setImage(undefined)}>Undo</button></p>}
        </div>
      </Field>
      <Field label="Explanation (shown after submission if allowed)"><textarea className="input" value={q.explanation} onChange={(e) => set("explanation", e.target.value)} /></Field>
      <div className="flex gap-2"><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save question"}</button>
        <button className="btn-outline" onClick={() => router.back()}>Cancel</button></div>
    </div>
  );
}
