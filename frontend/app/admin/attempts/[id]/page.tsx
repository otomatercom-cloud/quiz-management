import Link from "next/link";
import { notFound } from "next/navigation";
import { GradeForm } from "@/components/grade-form";
import { Badge, ErrorPanel, PageHeader, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, fmtPct, odooDate } from "@/lib/format";
import { adminSearch } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attempt" };

type Att = { id: number; reference: string; quiz_id: [number, string]; student_id: [number, string]; state: string; started_at: string | false; submitted_at: string | false; marks_obtained: number; total_marks: number; percentage: number; result_status: string; late_submission: boolean; time_taken_seconds: number };
type Ans = { id: number; sequence: number; question_type: string; snapshot: { text: string; options: { id: number; text: string; correct: boolean }[] } | false; selected_option_ids: number[] | false; textual_answer: string | false; marks_available: number; marks_awarded: number; is_correct: boolean; review_status: string; feedback: string | false };

export default async function AttemptDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireStaff("evaluator");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  try {
    const a = (await adminSearch<Att>(s.userId, "otm.quiz.attempt", { domain: [["id", "=", id]], limit: 1, fields: ["reference", "quiz_id", "student_id", "state", "started_at", "submitted_at", "marks_obtained", "total_marks", "percentage", "result_status", "late_submission", "time_taken_seconds"] })).records[0];
    if (!a) notFound();
    const answers = (await adminSearch<Ans>(s.userId, "otm.quiz.attempt.answer", { domain: [["attempt_id", "=", id]], limit: 200, order: "sequence", fields: ["sequence", "question_type", "snapshot", "selected_option_ids", "textual_answer", "marks_available", "marks_awarded", "is_correct", "review_status", "feedback"] })).records;
    const pending = answers.filter((x) => x.review_status === "pending").length;
    return (
      <>
        <PageHeader title={`${a.student_id[1]} — ${a.quiz_id[1]}`} subtitle={a.reference} actions={<Link className="btn-outline" href="/admin/attempts">Back</Link>} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Score" value={`${a.marks_obtained}/${a.total_marks}`} hint={fmtPct(a.percentage)} /><Stat label="Result" value={<Badge value={a.result_status} />} />
          <Stat label="Status" value={<Badge value={a.state} />} hint={a.late_submission ? "late submission" : undefined} /><Stat label="Time taken" value={`${Math.round(a.time_taken_seconds / 60)} min`} hint={fmtDateTime(odooDate(a.submitted_at || null))} />
        </div>
        {pending > 0 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-warn">{pending} descriptive answer(s) waiting for grading. The result updates automatically after grading.</p>}
        <div className="mt-6 space-y-4">
          {answers.map((x) => {
            const sel = new Set(x.selected_option_ids || []);
            return (
              <section key={x.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">Q{x.sequence}. {x.snapshot ? x.snapshot.text : ""}</p>
                  <span className="shrink-0 text-sm text-muted">{x.marks_awarded}/{x.marks_available}</span>
                </div>
                {x.question_type === "descriptive" ? (
                  <>
                    <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{x.textual_answer || <span className="text-muted">No answer</span>}</p>
                    <GradeForm answerId={x.id} max={x.marks_available} marks={x.marks_awarded} feedback={x.feedback || ""} />
                  </>
                ) : (
                  <ul className="mt-3 space-y-1 text-sm">
                    {(x.snapshot ? x.snapshot.options : []).map((o) => (
                      <li key={o.id} className={o.correct ? "font-medium text-ok" : sel.has(o.id) ? "text-bad" : ""}>
                        {sel.has(o.id) ? "● " : "○ "}{o.text}{o.correct ? "  ✓ correct" : ""}{sel.has(o.id) && !o.correct ? "  ✗ chosen" : ""}
                      </li>
                    ))}
                    {sel.size === 0 && <li className="text-muted">Not answered</li>}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </>
    );
  } catch (e) { return <ErrorPanel error={e} />; }
}
