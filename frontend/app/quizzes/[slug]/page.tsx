import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public-header";
import { Alert, Badge, ButtonLink } from "@/components/ui";
import { RegisterQuizButton } from "@/components/student-actions";
import { getStudent } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { OdooError } from "@/lib/odoo/client";
import { publicQuiz } from "@/lib/services/student";

export const dynamic = "force-dynamic";

export default async function QuizDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = slug.split("-").pop() ?? "";
  if (!/^[0-9a-f]{16}$/.test(id)) notFound();
  let quiz;
  try { quiz = await publicQuiz(id); } catch (e) {
    if (e instanceof OdooError && e.kind === "user") notFound();
    throw e;
  }
  const student = await getStudent();
  const rows: [string, string][] = [
    ["Quiz window", `${fmtDateTime(quiz.quiz_start)} → ${fmtDateTime(quiz.quiz_end)}`],
    ["Duration", `${quiz.duration_minutes} minutes`], ["Questions", String(quiz.question_total)],
    ["Total marks", String(quiz.total_marks)], ["Pass mark", `${quiz.passing_percentage}%`],
    ["Attempts allowed", String(quiz.maximum_attempts)],
    ["Negative marking", quiz.negative_marking ? "Yes" : "No"],
    ...(quiz.registration_required ? [["Registration", `${fmtDateTime(quiz.registration_start)} → ${fmtDateTime(quiz.registration_end)}`] as [string, string]] : []),
  ];
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-2 flex items-center gap-2"><Badge value={quiz.state} /><span className="text-sm text-muted">{quiz.subject}</span></div>
        <h1 className="text-3xl font-bold">{quiz.title}</h1>
        {quiz.description && <p className="mt-3 text-muted">{quiz.description}</p>}
        <div className="card mt-6 divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm"><span className="text-muted">{k}</span><span className="font-medium">{v}</span></div>
          ))}
        </div>
        {quiz.eligibility_notes && <div className="mt-4"><Alert tone="info"><strong>Eligibility:</strong> {quiz.eligibility_notes}</Alert></div>}
        {!!quiz.scholarship_bands?.length && (
          <section className="card mt-6 p-5">
            <h2 className="font-semibold">Scholarship bands</h2>
            <p className="mt-1 text-xs text-muted">Reaching a band makes you eligible; awards are confirmed by the institute after review.</p>
            <ul className="mt-3 space-y-1 text-sm">
              {quiz.scholarship_bands.map((b) => (
                <li key={b.name}>{b.min}%{b.max ? `–${b.max}%` : " and above"} → {b.type === "percentage" ? `${b.value}% fee waiver` : `₹${b.value} off`}{b.must_pass && " (pass required)"}</li>
              ))}
            </ul>
          </section>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {student ? (
            <RegisterQuizButton quizId={quiz.id} open={quiz.registration_open} required={quiz.registration_required} />
          ) : (
            <>
              <ButtonLink href={`/register`}>Create account to register</ButtonLink>
              <ButtonLink href={`/login?next=/student/quizzes`} variant="outline">Sign in</ButtonLink>
            </>
          )}
        </div>
      </main>
    </>
  );
}
