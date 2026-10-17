import { Badge, EmptyState, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { RegisterQuizButton, StartQuizButton } from "@/components/student-actions";
import { requireStudent } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { pageOf } from "@/lib/services/admin";
import { studentQuizzes } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quizzes" };

export default async function StudentQuizzes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStudent();
  const sp = await searchParams;
  const page = pageOf(sp.page);
  let data;
  try { data = await studentQuizzes(s.partnerId, sp.q ?? "", page); } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Quizzes" subtitle="Register, then start when the quiz window opens." />
      <SearchBar action="/student/quizzes" q={sp.q} placeholder="Search quizzes" />
      {!data.items.length ? <EmptyState title="No quizzes available" /> : (
        <div className="space-y-4">
          {data.items.map((q) => {
            const registered = q.registration_status === "registered" || q.registration_status === "confirmed";
            return (
              <article key={q.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{q.title}</h2>
                    {q.registration_status && <Badge value={q.registration_status} />}
                    {q.scholarship_enabled && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-warn">Scholarship</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{fmtDateTime(q.quiz_start)} → {fmtDateTime(q.quiz_end)} · {q.duration_minutes} min · {q.total_marks} marks · pass {q.passing_percentage}%</p>
                  <p className="text-xs text-muted">Attempts used {q.attempts_used ?? 0}/{q.maximum_attempts}</p>
                </div>
                <div>
                  {q.can_start ? <StartQuizButton quizId={q.id} duration={q.duration_minutes} resume={!!q.active_attempt} />
                    : q.registration_required && !registered ? <RegisterQuizButton quizId={q.id} open={q.registration_open} required />
                    : <span className="text-sm text-muted">{registered ? "Registered — opens at start time" : "Not available"}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Pagination total={data.total} page={page} pageSize={12} base="/student/quizzes" params={{ q: sp.q }} />
    </>
  );
}
