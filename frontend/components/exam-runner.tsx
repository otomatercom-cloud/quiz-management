"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExamTools } from "@/components/exam-tools";
import { postJson, ConfirmDialog } from "@/components/forms";
import { Alert, cn } from "@/components/ui";
import { clockOffsetMs, formatClock, remainingMs } from "@/lib/timer";
import { enqueue, selectOption, statusOf, summarize, type Question, type SavePayload } from "@/lib/quiz-state";

type Props = {
  attemptId: string;
  title: string;
  instructions: string;
  deadlineAt: string;
  serverNow: string;
  questions: Question[];
  integrity?: Integrity;
  inSeb?: boolean;
};
export type Integrity = { mode: "off" | "warn" | "strict"; max: number; count: number; calculator: boolean; spreadsheet: boolean };
type SaveState = "saved" | "saving" | "offline" | "error";
type Receipt = { reference: string; submitted_at: string; late: boolean; result_visible: boolean; quiz_title: string };

const VIOLATION_KINDS = ["blur", "hidden", "fullscreen_exit"] as const;

export function ExamRunner({ attemptId, title, deadlineAt, serverNow, questions: initial, integrity, inSeb }: Props) {
  const watching = !!integrity && integrity.mode !== "off";
  const [started, setStarted] = useState(!watching); // watched exams begin with a click (fullscreen needs a user gesture)
  const [strikes, setStrikes] = useState(integrity?.count ?? 0);
  const [warning, setWarning] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>(initial);
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offset = useRef(clockOffsetMs(serverNow, Date.now()));
  const [left, setLeft] = useState(() => remainingMs(deadlineAt, offset.current, Date.now()));
  const queue = useRef<SavePayload[]>([]);
  const inflight = useRef<Promise<void> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  const flush = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      setSaveState("saving");
      while (queue.current.length) {
        const item = queue.current[0];
        try {
          await postJson("/api/student/save_answer", { attempt_public_id: attemptId, ...item });
          queue.current = queue.current.filter((p) => p !== item); // a newer merged payload for the same question stays queued
        } catch (e) {
          if (/Time is over|no longer active/i.test((e as Error).message)) { queue.current = []; setSaveState("error"); return; }
          setSaveState(navigator.onLine ? "error" : "offline");
          if (!retry.current) retry.current = setTimeout(() => { retry.current = null; void flush(); }, 3000); // never dropped
          return;
        }
      }
      setSaveState("saved");
    })().finally(() => { inflight.current = null; });
    inflight.current = run;
    return run;
  }, [attemptId]);

  const schedule = useCallback((p: SavePayload) => {
    queue.current = enqueue(queue.current, p);
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, 350);
  }, [flush]);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      await flush();
      if (queue.current.length && remainingMs(deadlineAt, offset.current, Date.now()) > 0)
        throw new Error("Your latest answers could not be saved yet. Check your connection and try again.");
      const r = await postJson<Receipt>("/api/student/submit_attempt", { attempt_public_id: attemptId });
      setReceipt(r);
      setConfirming(false);
    } catch (e) {
      submittedRef.current = false; // submission is idempotent on the server, so retrying is safe
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, flush, deadlineAt]);

  // countdown (visual only — the server enforces the real deadline)
  useEffect(() => {
    const t = setInterval(() => {
      const ms = remainingMs(deadlineAt, offset.current, Date.now());
      setLeft(ms);
      if (ms <= 0) void submit();
    }, 500);
    return () => clearInterval(t);
  }, [deadlineAt, submit]);

  useEffect(() => {
    const on = () => { setSaveState("saving"); void flush(); };
    const off = () => setSaveState("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush]);

  // integrity watcher: reports focus loss / tab switch / leaving fullscreen; the server counts and may auto-submit
  useEffect(() => {
    if (!watching || !started) return;
    let wasFullscreen = !!document.fullscreenElement;
    let last = 0;
    const report = (kind: string) => {
      const now = Date.now();
      if (kind !== "paste" && now - last < 1500) return; // blur + visibilitychange fire together
      if (kind !== "paste") last = now;
      postJson<{ count: number; max: number; terminated: boolean }>("/api/student/log_event", { attempt_public_id: attemptId, kind })
        .then((r) => {
          setStrikes(r.count);
          if (r.terminated) { setWarning(null); void submit(); }
          else if (kind !== "paste" && integrity!.mode === "strict") setWarning(`Warning ${r.count} of ${r.max}: leaving the exam window is recorded. The quiz is submitted automatically at ${r.max}.`);
          else if (kind !== "paste") setWarning("Leaving the exam window has been recorded for review.");
        })
        .catch(() => undefined); // a failed report must never disturb the exam
    };
    const onVis = () => { if (document.visibilityState === "hidden") report("hidden"); };
    const onBlur = () => report("blur");
    const onFs = () => { if (wasFullscreen && !document.fullscreenElement) report("fullscreen_exit"); wasFullscreen = !!document.fullscreenElement; };
    const onPaste = (e: Event) => { e.preventDefault(); report("paste"); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("paste", onPaste);
    };
  }, [watching, started, attemptId, integrity, submit]);

  const q = questions[index];
  const sum = useMemo(() => summarize(questions), [questions]);

  function choose(optionId: number) {
    setQuestions((qs) => selectOption(qs, q.seq, optionId));
    const next = q.selected[0] === optionId ? [] : [optionId];
    schedule({ seq: q.seq, option_ids: next });
  }
  function typeAnswer(text: string) {
    setQuestions((qs) => qs.map((x) => (x.seq === q.seq ? { ...x, text_answer: text } : x)));
    schedule({ seq: q.seq, text });
  }
  function toggleMark() {
    const marked = !q.marked;
    setQuestions((qs) => qs.map((x) => (x.seq === q.seq ? { ...x, marked } : x)));
    schedule({ seq: q.seq, marked });
  }

  if (receipt) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
        <div className="card w-full p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl text-ok" aria-hidden>✓</div>
          <h1 className="text-2xl font-bold">Quiz submitted</h1>
          <p className="mt-2 text-sm text-muted">{receipt.quiz_title}</p>
          <dl className="mt-6 space-y-2 text-left text-sm">
            <div className="flex justify-between"><dt className="text-muted">Receipt</dt><dd className="font-mono">{receipt.reference}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Submitted</dt><dd>{new Date(receipt.submitted_at).toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Answered</dt><dd>{sum.answered} of {sum.total}</dd></div>
          </dl>
          {receipt.late && <div className="mt-4"><Alert tone="warning">Time ran out — your saved answers were submitted automatically.</Alert></div>}
          <Link href={receipt.result_visible ? `/student/results/${attemptId}` : "/student/results"} className="btn-primary mt-6 w-full">
            {receipt.result_visible ? "View result" : "Back to results"}
          </Link>
        </div>
      </main>
    );
  }

  const low = left < 60_000;
  if (watching && !started) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <div className="card w-full space-y-4 p-8">
          <h1 className="text-xl font-bold">{title}</h1>
          <Alert tone="warning">
            This exam is monitored. Switching tabs or windows, or leaving full screen, is recorded
            {integrity!.mode === "strict" ? ` and the quiz is submitted automatically after ${integrity!.max} warnings` : " for your teacher to review"}. Pasting is disabled.
            {(integrity!.calculator || integrity!.spreadsheet) && " A calculator/spreadsheet is available inside the exam."}
          </Alert>
          <button className="btn-primary w-full" onClick={() => { if (!inSeb) void document.documentElement.requestFullscreen?.().catch(() => undefined); setStarted(true); }}>
            {inSeb ? "Start the exam" : "Start the exam in full screen"}
          </button>
        </div>
      </main>
    );
  }
  return (
    <div className="min-h-screen bg-page" onCopy={watching ? (e) => e.preventDefault() : undefined}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0"><p className="truncate font-semibold">{title}</p>
            <p className="text-xs text-muted" aria-live="polite">
              {saveState === "saved" && "All answers saved"}{saveState === "saving" && "Saving…"}
              {saveState === "offline" && <span className="text-warn">Offline — answers are kept and will sync</span>}
              {saveState === "error" && <span className="text-bad">Save problem — retrying</span>}
            </p></div>
          <div className={cn("rounded-lg px-4 py-2 text-lg font-bold tabular-nums", low ? "bg-red-50 text-bad" : "bg-primary-light text-navy")} role="timer" aria-label="Time remaining">
            {formatClock(left)}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
        <section className="card p-6" aria-labelledby="qtitle">
          <div className="mb-4 flex items-center justify-between text-sm text-muted">
            <span id="qtitle">Question {index + 1} of {questions.length}</span><span>{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
          </div>
          <p className="whitespace-pre-wrap text-lg font-medium">{q.text}</p>
          {q.type === "descriptive" ? (
            <textarea className="input mt-5 min-h-40" value={q.text_answer} maxLength={5000} onChange={(e) => typeAnswer(e.target.value)} aria-label="Your answer" />
          ) : (
            <div className="mt-5 space-y-2" role="radiogroup" aria-label="Answer options">
              {q.options.map((o) => {
                const on = q.selected.includes(o.id);
                return (
                  <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => choose(o.id)}
                    className={cn("flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition", on ? "border-primary bg-primary-light font-medium" : "border-slate-300 hover:bg-slate-50")}>
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", on ? "border-primary bg-primary" : "border-slate-400")}>{on && <span className="h-2 w-2 rounded-full bg-white" />}</span>
                    {o.text}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button className="btn-outline" onClick={toggleMark}>{q.marked ? "Unmark review" : "Mark for review"}</button>
            <div className="flex gap-2">
              <button className="btn-outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
              {index < questions.length - 1
                ? <button className="btn-primary" onClick={() => setIndex(index + 1)}>Next</button>
                : <button className="btn-primary" onClick={() => setConfirming(true)}>Review &amp; submit</button>}
            </div>
          </div>
        </section>

        <aside className="card h-fit p-5" aria-label="Question navigation">
          <div className="grid grid-cols-5 gap-2">
            {questions.map((x, i) => {
              const st = statusOf(x);
              return (
                <button key={x.seq} onClick={() => setIndex(i)} aria-label={`Question ${i + 1}, ${st}`} aria-current={i === index}
                  className={cn("h-10 rounded-lg border text-sm font-semibold",
                    i === index && "ring-2 ring-primary ring-offset-1",
                    st === "answered" && "border-ok bg-green-50 text-ok",
                    st === "review" && "border-warn bg-amber-50 text-warn",
                    st === "unanswered" && "border-slate-300 bg-white text-muted")}>{i + 1}</button>
              );
            })}
          </div>
          <ul className="mt-4 space-y-1 text-xs text-muted">
            <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-ok" />Answered ({sum.answered})</li>
            <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-warn" />Marked for review ({sum.marked})</li>
            <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />Not answered ({sum.unanswered})</li>
          </ul>
          <button className="btn-primary mt-5 w-full" onClick={() => setConfirming(true)}>Submit quiz</button>
        </aside>
      </main>

      <ExamTools calculator={!!integrity?.calculator} spreadsheet={!!integrity?.spreadsheet} attemptId={attemptId} />
      {watching && strikes > 0 && !warning && <div className="fixed left-4 top-16 z-20 rounded-lg bg-amber-50 px-3 py-1 text-xs text-warn">Warnings: {strikes}{integrity!.mode === "strict" ? ` / ${integrity!.max}` : ""}</div>}
      {warning && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-label="Exam warning">
          <div className="card max-w-md space-y-4 p-6">
            <p className="font-semibold text-bad">{warning}</p>
            <button className="btn-primary w-full" onClick={() => { setWarning(null); if (!inSeb && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined); }}>Return to exam</button>
          </div>
        </div>
      )}
      {confirming && (
        <ConfirmDialog title="Submit your quiz?" busy={submitting} error={error} confirmLabel="Submit now"
          text={`You answered ${sum.answered} of ${sum.total} questions${sum.marked ? `, ${sum.marked} marked for review` : ""}${sum.unanswered ? `, and ${sum.unanswered} are unanswered` : ""}. You cannot change answers after submitting.`}
          onCancel={() => setConfirming(false)} onConfirm={() => void submit()} />
      )}
      {!confirming && error && <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-md"><Alert>{error}</Alert></div>}
    </div>
  );
}
