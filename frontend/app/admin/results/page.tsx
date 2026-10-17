import { Badge, DataTable, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, fmtPct, odooDate } from "@/lib/format";
import { adminSearch, pageOf, PAGE_SIZE } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results" };
type Row = { id: number; quiz_id: [number, string]; student_id: [number, string]; submitted_at: string | false; marks_obtained: number; total_marks: number; percentage: number; result_status: string; time_taken_seconds: number };

export default async function Results({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("evaluator");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const domain = [["state", "in", ["evaluated", "expired"]], ...(sp.result ? [["result_status", "=", sp.result]] : []), ...(sp.q ? ["|", ["student_id.name", "ilike", sp.q], ["quiz_id.name", "ilike", sp.q]] : [])];
  let d;
  try { d = await adminSearch<Row>(s.userId, "otm.quiz.attempt", { domain, page, order: "percentage desc, time_taken_seconds asc", fields: ["quiz_id", "student_id", "submitted_at", "marks_obtained", "total_marks", "percentage", "result_status", "time_taken_seconds"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Results" />
      <SearchBar action="/admin/results" q={sp.q} placeholder="Student or quiz">
        <select name="result" defaultValue={sp.result ?? ""} className="input max-w-36" aria-label="Result"><option value="">All</option><option value="pass">Pass</option><option value="fail">Fail</option></select>
      </SearchBar>
      <DataTable head={["Student", "Quiz", "Submitted", "Marks", "Percentage", "Time", "Result"]} empty={!d.records.length}>
        {d.records.map((a) => (
          <tr key={a.id}><td className="td">{a.student_id[1]}</td><td className="td">{a.quiz_id[1]}</td><td className="td text-xs">{fmtDateTime(odooDate(a.submitted_at || null))}</td>
            <td className="td">{a.marks_obtained}/{a.total_marks}</td><td className="td">{fmtPct(a.percentage)}</td><td className="td">{Math.round(a.time_taken_seconds / 60)} min</td><td className="td"><Badge value={a.result_status} /></td></tr>
        ))}
      </DataTable>
      <Pagination total={d.total} page={page} pageSize={PAGE_SIZE} base="/admin/results" params={{ q: sp.q, result: sp.result }} />
    </>
  );
}
