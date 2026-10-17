"use client";
import { useEffect, useState } from "react";
import { postJson } from "@/components/forms";
import { Alert } from "@/components/ui";

export type QuestionRow = { id: number; question_text: string; question_type: string; subject: string | false; difficulty: string; marks: number };
export type PoolDraft = { name: string; subject: string; topic: string; difficulty: string; question_type: string; questions_to_select: number; marks_per_question: number };
export type RuleDraft = { name: string; minimum_percentage: number; maximum_percentage: number; scholarship_type: "percentage" | "fixed_amount"; scholarship_value: number; sequence: number };

export function QuestionPicker({ selected, onChange, locked }: { selected: number[]; onChange: (ids: number[]) => void; locked?: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await postJson<{ records: QuestionRow[] }>("/api/admin/search", {
          model: "otm.quiz.question", fields: ["question_text", "question_type", "subject", "difficulty", "marks"], limit: 30,
          domain: q ? [["question_text", "ilike", q]] : [], order: "id desc",
        });
        setRows(r.records); setError(null);
      } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input className="input max-w-sm" placeholder="Search the question bank…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search questions" />
        <span className="text-sm text-muted">{selected.length} selected</span>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {loading && !rows.length ? <p className="p-4 text-sm text-muted">Loading…</p> : rows.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm hover:bg-slate-50">
            <input type="checkbox" disabled={locked} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} className="mt-1" />
            <span className="min-w-0 flex-1"><span className="line-clamp-2">{r.question_text}</span>
              <span className="text-xs text-muted">{r.question_type} · {r.difficulty} · {r.subject || "no subject"} · {r.marks} mark(s)</span></span>
          </label>
        ))}
        {!loading && !rows.length && <p className="p-4 text-sm text-muted">No questions found.</p>}
      </div>
    </div>
  );
}

const blankPool: PoolDraft = { name: "", subject: "", topic: "", difficulty: "any", question_type: "mcq", questions_to_select: 5, marks_per_question: 0 };

export function PoolForm({ onAdd }: { onAdd: (p: PoolDraft) => void | Promise<void> }) {
  const [p, setP] = useState<PoolDraft>(blankPool);
  const set = <K extends keyof PoolDraft>(k: K, v: PoolDraft[K]) => setP((x) => ({ ...x, [k]: v }));
  const valid = p.name.trim() && p.questions_to_select >= 1;
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
      <input className="input" placeholder="Pool name" value={p.name} onChange={(e) => set("name", e.target.value)} aria-label="Pool name" />
      <input className="input" placeholder="Subject filter" value={p.subject} onChange={(e) => set("subject", e.target.value)} aria-label="Subject" />
      <input className="input" placeholder="Topic filter" value={p.topic} onChange={(e) => set("topic", e.target.value)} aria-label="Topic" />
      <select className="input" value={p.difficulty} onChange={(e) => set("difficulty", e.target.value)} aria-label="Difficulty">
        {["any", "easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select className="input" value={p.question_type} onChange={(e) => set("question_type", e.target.value)} aria-label="Type">
        <option value="mcq">MCQ</option><option value="true_false">True / False</option>
      </select>
      <input className="input" type="number" min={1} value={p.questions_to_select} onChange={(e) => set("questions_to_select", Number(e.target.value))} aria-label="Questions to select" />
      <input className="input" type="number" min={0} step="0.25" placeholder="Marks per question (0 = own marks)" value={p.marks_per_question} onChange={(e) => set("marks_per_question", Number(e.target.value))} aria-label="Marks per question" />
      <button type="button" className="btn-outline sm:col-span-2" disabled={!valid} onClick={async () => { await onAdd(p); setP(blankPool); }}>Add pool</button>
    </div>
  );
}

const blankRule: RuleDraft = { name: "", minimum_percentage: 70, maximum_percentage: 0, scholarship_type: "percentage", scholarship_value: 10, sequence: 10 };

export function RuleForm({ onAdd }: { onAdd: (r: RuleDraft) => void | Promise<void> }) {
  const [r, setR] = useState<RuleDraft>(blankRule);
  const set = <K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) => setR((x) => ({ ...x, [k]: v }));
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
      <input className="input" placeholder="Rule name" value={r.name} onChange={(e) => set("name", e.target.value)} aria-label="Rule name" />
      <input className="input" type="number" min={0} max={100} placeholder="Min % (inclusive)" value={r.minimum_percentage} onChange={(e) => set("minimum_percentage", Number(e.target.value))} aria-label="Minimum percentage" />
      <input className="input" type="number" min={0} max={100} placeholder="Max % (exclusive, 0 = none)" value={r.maximum_percentage} onChange={(e) => set("maximum_percentage", Number(e.target.value))} aria-label="Maximum percentage" />
      <select className="input" value={r.scholarship_type} onChange={(e) => set("scholarship_type", e.target.value as RuleDraft["scholarship_type"])} aria-label="Benefit type">
        <option value="percentage">Fee waiver (%)</option><option value="fixed_amount">Fixed amount</option>
      </select>
      <input className="input" type="number" min={0} step="0.01" placeholder="Value" value={r.scholarship_value} onChange={(e) => set("scholarship_value", Number(e.target.value))} aria-label="Value" />
      <input className="input" type="number" placeholder="Priority (lower wins)" value={r.sequence} onChange={(e) => set("sequence", Number(e.target.value))} aria-label="Priority" />
      <button type="button" className="btn-outline sm:col-span-3" disabled={!r.name.trim() || r.scholarship_value <= 0} onClick={async () => { await onAdd(r); setR({ ...blankRule, sequence: r.sequence + 10 }); }}>Add rule</button>
    </div>
  );
}
