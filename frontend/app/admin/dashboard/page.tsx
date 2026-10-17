import Link from "next/link";
import { BarChart } from "@/components/charts";
import { Badge, ButtonLink, DataTable, ErrorPanel, PageHeader, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, odooDate } from "@/lib/format";
import { adminDashboard } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const s = await requireStaff("manager");
  let d;
  try { d = await adminDashboard(s.userId); } catch (e) { return <ErrorPanel error={e} />; }
  const c = d.cards;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live figures from your Odoo database."
        actions={<><ButtonLink href="/admin/quizzes/new">New quiz</ButtonLink><ButtonLink href="/admin/questions/new" variant="outline">New question</ButtonLink><ButtonLink href="/admin/import" variant="outline">Import questions</ButtonLink></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total quizzes" value={c.total_quizzes} /><Stat label="Published quizzes" value={c.published_quizzes} />
        <Stat label="Questions in bank" value={c.total_questions} /><Stat label="Registered students" value={c.registered_students} />
        <Stat label="Active attempts" value={c.active_attempts} /><Stat label="Completed attempts" value={c.completed_attempts} />
        <Stat label="Pass rate" value={c.pass_rate === null ? "—" : `${c.pass_rate}%`} hint="of evaluated attempts" />
        <Stat label="Scholarship eligible" value={c.scholarship_eligible} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Completions — last 14 days</h2>
          <BarChart data={d.completion_trend.map((t) => ({ label: t.day.slice(5), value: t.count }))} empty="No completed attempts in this period" />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Upcoming assessments</h2>
          {d.upcoming.length ? (
            <ul className="space-y-2 text-sm">{d.upcoming.map((q) => (
              <li key={q.id} className="flex justify-between gap-2"><Link className="font-medium text-primary" href={`/admin/quizzes/${q.public_id}`}>{q.name}</Link><span className="text-muted">{fmtDateTime(odooDate(q.quiz_start))}</span></li>
            ))}</ul>
          ) : <p className="text-sm text-muted">No upcoming published quizzes.</p>}
        </section>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section><h2 className="mb-3 font-semibold">Recent quizzes</h2>
          <DataTable head={["Quiz", "Status"]} empty={!d.recent_quizzes.length}>
            {d.recent_quizzes.map((q) => <tr key={q.id}><td className="td"><Link className="font-medium text-primary" href={`/admin/quizzes/${q.public_id}`}>{q.name}</Link></td><td className="td"><Badge value={q.state} /></td></tr>)}
          </DataTable></section>
        <section><h2 className="mb-3 font-semibold">Recent registrations</h2>
          <DataTable head={["Student", "Quiz", "Status"]} empty={!d.recent_registrations.length}>
            {d.recent_registrations.map((r) => <tr key={r.id}><td className="td">{r.student_id[1]}</td><td className="td">{r.quiz_id[1]}</td><td className="td"><Badge value={r.state} /></td></tr>)}
          </DataTable></section>
      </div>
    </>
  );
}
