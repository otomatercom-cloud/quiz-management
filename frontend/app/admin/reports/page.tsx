import { BarChart } from "@/components/charts";
import { Badge, DataTable, EmptyState, ErrorPanel, PageHeader, SearchBar, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtPct } from "@/lib/format";
import { adminReport, adminSearch } from "@/lib/services/admin";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("manager");
  const sp = await searchParams;
  try {
    const quizzes = await adminSearch<{ public_id: string; name: string }>(s.userId, "otm.quiz", { fields: ["public_id", "name"], order: "id desc", limit: 100 });
    const r = sp.quiz ? await adminReport(s.userId, sp.quiz) : null;
    return (
      <>
        <PageHeader title="Reports" actions={r ? <PrintButton /> : undefined} />
        <SearchBar action="/admin/reports">
          <select name="quiz" defaultValue={sp.quiz ?? ""} className="input max-w-md" aria-label="Quiz"><option value="">Select a quiz…</option>{quizzes.records.map((q) => <option key={q.public_id} value={q.public_id}>{q.name}</option>)}</select>
        </SearchBar>
        {!r ? <EmptyState title="Choose a quiz" text="Pick a quiz to see its participation, score distribution and ranking." /> : (<>
          <h2 className="mb-3 text-lg font-semibold">{r.quiz.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Registered" value={r.registrations} hint={`${r.confirmed} confirmed · ${r.cancelled} cancelled`} /><Stat label="Started / completed" value={`${r.started} / ${r.completed}`} />
            <Stat label="Pass rate" value={r.pass_rate === null ? "—" : fmtPct(r.pass_rate)} hint={`${r.passed} pass · ${r.failed} fail`} /><Stat label="Average score" value={r.average_percentage === null ? "—" : fmtPct(r.average_percentage)} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="card p-5"><h3 className="mb-3 font-semibold">Score distribution</h3><BarChart data={r.score_distribution.map((b) => ({ label: b.range, value: b.count }))} /></section>
            <section className="card p-5"><h3 className="mb-3 font-semibold">Subject performance (correct %)</h3>
              <BarChart unit="%" data={r.subject_performance.map((x) => ({ label: x.subject, value: x.correct + x.wrong ? Math.round((x.correct * 1000) / (x.correct + x.wrong)) / 10 : 0 }))} /></section>
          </div>
          <h3 className="mb-2 mt-6 font-semibold">Ranking</h3>
          <DataTable head={["Rank", "Student", "Marks", "%", "Time", "Result"]} empty={!r.ranking.length}>
            {r.ranking.map((x) => <tr key={x.attempt}><td className="td">{x.rank}</td><td className="td">{x.student}</td><td className="td">{x.marks}</td><td className="td">{fmtPct(x.percentage)}</td><td className="td">{Math.round(x.time_seconds / 60)} min</td><td className="td"><Badge value={x.result} /></td></tr>)}
          </DataTable>
        </>)}
      </>
    );
  } catch (e) { return <ErrorPanel error={e} />; }
}
