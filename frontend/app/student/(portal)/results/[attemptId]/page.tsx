import { notFound } from "next/navigation";
import { Alert, Badge, ButtonLink, PageHeader, Stat } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireStudent } from "@/lib/auth/session";
import { fmtDateTime, fmtDuration, fmtPct } from "@/lib/format";
import { OdooError } from "@/lib/odoo/client";
import { resultDetail } from "@/lib/services/student";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const s = await requireStudent();
  const { attemptId } = await params;
  if (!/^[0-9a-f]{16}$/.test(attemptId)) notFound();
  let r;
  try { r = await resultDetail(s.partnerId, attemptId); } catch (e) {
    if (e instanceof OdooError && (e.kind === "forbidden" || e.kind === "user")) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader title={r.quiz_title} subtitle={`Attempt #${r.attempt_number} · ${r.reference} · submitted ${fmtDateTime(r.submitted_at)}`}
        actions={<><PrintButton /><ButtonLink href="/student/results" variant="outline">All results</ButtonLink></>} />
      {!r.visible ? (
        <Alert tone="info">Your answers were submitted. Results have not been released yet — you will see them here once published.</Alert>
      ) : (
        <>
          {r.result_status === "pending" && <div className="mb-4"><Alert tone="warning">Some answers are awaiting manual grading, so your final result is pending.</Alert></div>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Marks" value={`${r.marks_obtained} / ${r.total_marks}`} />
            <Stat label="Percentage" value={fmtPct(r.percentage)} hint={`Pass mark ${r.passing_percentage}%`} />
            <Stat label="Result" value={<Badge value={r.result_status ?? "pending"} />} />
            <Stat label="Time taken" value={fmtDuration(r.time_taken_seconds ?? 0)} />
          </div>
          {r.scholarship_status && r.scholarship_status !== "not_applicable" && (
            <section className="card mt-6 p-5">
              <div className="flex items-center gap-3"><h2 className="font-semibold">Scholarship</h2><Badge value={r.scholarship_status} /></div>
              {r.scholarship_status === "eligible" && (
                <p className="mt-2 text-sm">You are <strong>eligible</strong> for {r.scholarship_type === "percentage" ? `a ${r.scholarship_value}% fee waiver` : `₹${r.scholarship_value}`}
                  {r.scholarship_amount ? ` (about ₹${r.scholarship_amount})` : ""}. Eligibility is not a confirmed award — the institute will review and confirm.</p>
              )}
              {r.scholarship_explanation && <p className="mt-2 text-sm text-muted">{r.scholarship_explanation}</p>}
            </section>
          )}
          {r.review && (
            <section className="mt-6 space-y-4">
              <h2 className="text-lg font-semibold">Answer review</h2>
              {r.review.map((q) => (
                <article key={q.seq} className="card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium"><span className="text-muted">Q{q.seq}.</span> {q.text}</p>
                    <Badge value={q.is_correct ? "pass" : "fail"} label={`${q.marks_awarded} / ${q.marks_available}`} />
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {q.options.map((o) => (
                      <li key={o.id} className={`rounded-lg border px-3 py-2 ${o.correct ? "border-green-300 bg-green-50" : q.selected.includes(o.id) ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
                        {o.text}{o.correct && <span className="ml-2 text-xs font-semibold text-ok">Correct</span>}{q.selected.includes(o.id) && !o.correct && <span className="ml-2 text-xs font-semibold text-bad">Your answer</span>}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && <p className="mt-3 text-sm text-muted"><strong>Explanation:</strong> {q.explanation}</p>}
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
