"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, cn } from "@/components/ui";
import { Field, postJson } from "@/components/forms";
import { PoolForm, QuestionPicker, RuleForm, type PoolDraft, type RuleDraft } from "@/components/quiz-builder";
import { toOdooDatetime } from "@/lib/format";
import { quizBasicsSchema, quizSettingsSchema } from "@/lib/validation/schemas";

type Values = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const STEPS = ["Basics", "Registration", "Assessment", "Questions", "Scholarship", "Review"];
const REG_FIELDS = ["registration_required", "registration_start", "registration_end", "registration_limit"];

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const toHtml = (s: string) => (s ? s.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("") : false);

export function buildQuizVals(v: Values) {
  const vals: Values = {
    name: v.name, subject: v.subject || false, description: v.description || false, instructions: toHtml(v.instructions ?? ""),
    quiz_start: toOdooDatetime(v.quiz_start), quiz_end: toOdooDatetime(v.quiz_end),
    duration_minutes: Number(v.duration_minutes), passing_percentage: Number(v.passing_percentage),
    maximum_attempts: Number(v.maximum_attempts), negative_marking_enabled: !!v.negative_marking_enabled,
    default_negative_marks: Number(v.default_negative_marks || 0), randomize_questions: !!v.randomize_questions,
    randomize_options: !!v.randomize_options, show_results_immediately: !!v.show_results_immediately,
    show_correct_answers_after_submission: !!v.show_correct_answers_after_submission,
    registration_required: !!v.registration_required, registration_limit: Number(v.registration_limit || 0),
    registration_start: v.registration_required && v.registration_start ? toOdooDatetime(v.registration_start) : false,
    registration_end: v.registration_required && v.registration_end ? toOdooDatetime(v.registration_end) : false,
    scholarship_enabled: !!v.scholarship_enabled, course_fee: Number(v.course_fee || 0),
  };
  return vals;
}

export function QuizWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fixed, setFixed] = useState<number[]>([]);
  const [pools, setPools] = useState<PoolDraft[]>([]);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { register, getValues, watch, setError: setFieldError, clearErrors, formState: { errors } } = useForm<Values>({
    defaultValues: {
      duration_minutes: 30, passing_percentage: 40, maximum_attempts: 1, randomize_questions: true, randomize_options: true,
      show_results_immediately: true, registration_required: true, registration_limit: 0, default_negative_marks: 0,
      scholarship_enabled: false, course_fee: 0,
    },
  });
  const sch = watch("scholarship_enabled");
  const neg = watch("negative_marking_enabled");
  const regReq = watch("registration_required");

  function validate(s: number): boolean {
    clearErrors();
    const v = getValues();
    let issues: { path: (string | number)[]; message: string }[] = [];
    if (s === 0) issues = quizBasicsSchema.safeParse(v).error?.issues ?? [];
    if (s === 1 || s === 2) {
      const all = quizSettingsSchema.safeParse(v).error?.issues ?? [];
      issues = all.filter((i) => (s === 1 ? REG_FIELDS.includes(String(i.path[0])) : !REG_FIELDS.includes(String(i.path[0]))));
    }
    issues.forEach((i) => setFieldError(String(i.path[0]), { message: i.message }));
    return issues.length === 0;
  }

  const next = () => { if (validate(step)) setStep(step + 1); };

  async function save(publish: boolean) {
    setBusy(true); setError(null);
    try {
      const v = getValues();
      const vals = {
        ...buildQuizVals(v),
        fixed_question_ids: [[6, 0, fixed]],
        question_pool_ids: pools.map((p) => [0, 0, { ...p }]),
        scholarship_rule_ids: v.scholarship_enabled ? rules.map((r) => [0, 0, { ...r }]) : [],
      };
      const id = await postJson<number>("/api/admin/create", { model: "otm.quiz", vals });
      const rec = await postJson<{ records: { public_id: string }[] }>("/api/admin/search", { model: "otm.quiz", domain: [["id", "=", id]], fields: ["public_id"], limit: 1 });
      const pub = rec.records[0].public_id;
      if (publish) {
        try { await postJson("/api/admin/call", { model: "otm.quiz", ids: [id], method: "action_publish" }); }
        catch (e) { setError(`Saved as draft, but it cannot be published yet: ${(e as Error).message}`); setBusy(false); setTimeout(() => router.push(`/admin/quizzes/${pub}`), 2500); return; }
      }
      router.push(`/admin/quizzes/${pub}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const v = getValues();
  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("rounded-full px-3 py-1 font-medium", i === step ? "bg-primary text-white" : i < step ? "bg-green-50 text-ok" : "bg-slate-100 text-muted")}>{i + 1}. {s}</li>
        ))}
      </ol>
      {error && <Alert>{error}</Alert>}
      <div className="card space-y-5 p-6">
        {step === 0 && (<>
          <Field label="Quiz title" error={errors.name?.message as string}><input className="input" {...register("name")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject / category"><input className="input" {...register("subject")} /></Field>
            <Field label="Short description"><input className="input" {...register("description")} /></Field>
          </div>
          <Field label="Instructions for students" hint="Blank line = new paragraph"><textarea className="input min-h-28" {...register("instructions")} /></Field>
        </>)}
        {step === 1 && (<>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" {...register("registration_required")} /> Students must register first</label>
          {regReq && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Registration opens" error={errors.registration_start?.message as string}><input type="datetime-local" className="input" {...register("registration_start")} /></Field>
              <Field label="Registration closes" error={errors.registration_end?.message as string}><input type="datetime-local" className="input" {...register("registration_end")} /></Field>
              <Field label="Registration limit" hint="0 = unlimited"><input type="number" min={0} className="input" {...register("registration_limit")} /></Field>
            </div>
          )}
          <p className="text-sm text-muted">Duplicate registrations are always blocked, and registration closes automatically at the deadline.</p>
        </>)}
        {step === 2 && (<>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quiz starts" error={errors.quiz_start?.message as string}><input type="datetime-local" className="input" {...register("quiz_start")} /></Field>
            <Field label="Quiz ends" error={errors.quiz_end?.message as string}><input type="datetime-local" className="input" {...register("quiz_end")} /></Field>
            <Field label="Duration (minutes)" error={errors.duration_minutes?.message as string}><input type="number" min={1} className="input" {...register("duration_minutes")} /></Field>
            <Field label="Passing percentage" error={errors.passing_percentage?.message as string}><input type="number" min={0} max={100} step="0.01" className="input" {...register("passing_percentage")} /></Field>
            <Field label="Maximum attempts" error={errors.maximum_attempts?.message as string}><input type="number" min={1} className="input" {...register("maximum_attempts")} /></Field>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <label className="flex items-center gap-2"><input type="checkbox" {...register("negative_marking_enabled")} /> Negative marking</label>
            {neg && <input type="number" min={0} step="0.25" className="input" placeholder="Default negative marks" {...register("default_negative_marks")} />}
            <label className="flex items-center gap-2"><input type="checkbox" {...register("randomize_questions")} /> Randomize question order</label>
            <label className="flex items-center gap-2"><input type="checkbox" {...register("randomize_options")} /> Randomize answer options</label>
            <label className="flex items-center gap-2"><input type="checkbox" {...register("show_results_immediately")} /> Show results immediately</label>
            <label className="flex items-center gap-2"><input type="checkbox" {...register("show_correct_answers_after_submission")} /> Show correct answers after submission</label>
          </div>
          <p className="text-sm text-muted">Total marks are calculated from the questions you select. MCQ and true/false are evaluated automatically.</p>
        </>)}
        {step === 3 && (<>
          <h2 className="font-semibold">Fixed questions</h2>
          <QuestionPicker selected={fixed} onChange={setFixed} />
          <h2 className="pt-2 font-semibold">Random pools</h2>
          {pools.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
              <span>{p.name} — {p.questions_to_select} × {p.question_type}{p.subject && ` · ${p.subject}`}{p.topic && ` / ${p.topic}`} · {p.difficulty}</span>
              <button type="button" className="text-bad" onClick={() => setPools(pools.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <PoolForm onAdd={(p) => setPools([...pools, p])} />
        </>)}
        {step === 4 && (<>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" {...register("scholarship_enabled")} /> Enable scholarships</label>
          {sch && (<>
            <Field label="Base course fee (for waiver amounts)"><input type="number" min={0} className="input max-w-xs" {...register("course_fee")} /></Field>
            {rules.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
                <span>{r.name}: {r.minimum_percentage}%{r.maximum_percentage ? `–${r.maximum_percentage}%` : "+"} → {r.scholarship_value}{r.scholarship_type === "percentage" ? "%" : ""} (priority {r.sequence})</span>
                <button type="button" className="text-bad" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <RuleForm onAdd={(r) => setRules([...rules, r])} />
            <p className="text-sm text-muted">Reaching a band makes a student <em>eligible</em>; an award still needs approval. Overlapping bands need different priorities.</p>
          </>)}
        </>)}
        {step === 5 && (
          <div className="space-y-3 text-sm">
            <h2 className="text-lg font-semibold">{v.name}</h2>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div><dt className="text-muted">Window</dt><dd>{v.quiz_start} → {v.quiz_end}</dd></div>
              <div><dt className="text-muted">Duration / pass mark</dt><dd>{v.duration_minutes} min · {v.passing_percentage}%</dd></div>
              <div><dt className="text-muted">Questions</dt><dd>{fixed.length} fixed + {pools.reduce((n, p) => n + p.questions_to_select, 0)} from {pools.length} pool(s)</dd></div>
              <div><dt className="text-muted">Registration</dt><dd>{v.registration_required ? `${v.registration_start} → ${v.registration_end}` : "Not required"}</dd></div>
              <div><dt className="text-muted">Scholarship</dt><dd>{v.scholarship_enabled ? `${rules.length} rule(s)` : "Disabled"}</dd></div>
            </dl>
            <Alert tone="info">Publishing is blocked automatically when the configuration is invalid (e.g. a pool needing more questions than exist). You can also save as a draft and finish later.</Alert>
          </div>
        )}
      </div>
      <div className="flex justify-between">
        <button className="btn-outline" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</button>
        {step < STEPS.length - 1 ? <button className="btn-primary" onClick={next}>Continue</button> : (
          <div className="flex gap-2">
            <button className="btn-outline" disabled={busy} onClick={() => void save(false)}>Save as draft</button>
            <button className="btn-primary" disabled={busy} onClick={() => void save(true)}>{busy ? "Working…" : "Create & publish"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
