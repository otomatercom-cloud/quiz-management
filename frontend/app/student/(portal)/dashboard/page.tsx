import Link from "next/link";
import { Badge, ButtonLink, EmptyState, ErrorPanel, PageHeader } from "@/components/ui";
import { QuizCardView } from "@/components/quiz-card";
import { requireStudent } from "@/lib/auth/session";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { studentDashboard } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const s = await requireStudent();
  let d;
  try { d = await studentDashboard(s.partnerId); } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title={`Welcome, ${d.student.name.split(" ")[0]}`} subtitle="Your quizzes, deadlines and results at a glance." />
      {d.active_attempt && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-primary bg-primary-light p-5">
          <div>
            <p className="font-semibold text-navy">Quiz in progress: {d.active_attempt.quiz_title}</p>
            <p className="text-sm text-muted">Ends {fmtDateTime(d.active_attempt.deadline_at)}</p>
          </div>
          <ButtonLink href={`/student/quiz/${d.active_attempt.id}`}>Resume</ButtonLink>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Available quizzes</h2>
          {d.available.length ? (
            <div className="grid gap-4 sm:grid-cols-2">{d.available.slice(0, 4).map((q) => <QuizCardView key={q.id} q={q} href="/student/quizzes" />)}</div>
          ) : <EmptyState title="No open quizzes" text="New quizzes will appear here when published." />}
        </section>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Registration deadlines</h2>
            {d.deadlines.length ? (
              <ul className="space-y-2 text-sm">{d.deadlines.map((x, i) => <li key={i} className="flex justify-between gap-2"><span>{x.quiz}</span><span className="text-muted">{fmtDateTime(x.registration_end)}</span></li>)}</ul>
            ) : <p className="text-sm text-muted">No upcoming deadlines.</p>}
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Recent results</h2>
            {d.recent_results.length ? (
              <ul className="space-y-3 text-sm">
                {d.recent_results.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/student/results/${r.id}`} className="font-medium text-primary">{r.quiz_title}</Link>
                    {r.visible ? <span>{fmtPct(r.percentage)} <Badge value={r.result_status ?? "pending"} /></span> : <Badge value="pending" label="Awaiting release" />}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No results yet.</p>}
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Scholarship status</h2>
            {d.scholarships.length ? (
              <ul className="space-y-2 text-sm">{d.scholarships.map((r) => <li key={r.id} className="flex justify-between gap-2"><span>{r.quiz_title}</span><Badge value={r.scholarship_status ?? "pending"} /></li>)}</ul>
            ) : <p className="text-sm text-muted">None yet.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
