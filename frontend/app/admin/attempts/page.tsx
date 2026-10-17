import { Badge, DataTable, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, fmtPct, odooDate } from "@/lib/format";
import { adminSearch, pageOf, PAGE_SIZE } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attempts" };
type Row = { id: number; reference: string; quiz_id: [number, string]; student_id: [number, string]; started_at: string; state: string; marks_obtained: number; total_marks: number; percentage: number; result_status: string; late_submission: boolean };

export default async function Attempts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("evaluator");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const domain = [...(sp.state ? [["state", "=", sp.state]] : []), ...(sp.q ? ["|", ["student_id.name", "ilike", sp.q], ["quiz_id.name", "ilike", sp.q]] : [])];
  let d;
  try { d = await adminSearch<Row>(s.userId, "otm.quiz.attempt", { domain, page, order: "id desc", fields: ["reference", "quiz_id", "student_id", "started_at", "state", "marks_obtained", "total_marks", "percentage", "result_status", "late_submission"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Attempts" />
      <SearchBar action="/admin/attempts" q={sp.q} placeholder="Student or quiz">
        <select name="state" defaultValue={sp.state ?? ""} className="input max-w-40" aria-label="Status"><option value="">All</option>{["in_progress", "submitted", "evaluated", "expired"].map((x) => <option key={x}>{x}</option>)}</select>
      </SearchBar>
      <DataTable head={["Ref", "Student", "Quiz", "Started", "Status", "Score", "Result"]} empty={!d.records.length}>
        {d.records.map((a) => (
          <tr key={a.id}><td className="td font-mono text-xs">{a.reference}</td><td className="td">{a.student_id[1]}</td><td className="td">{a.quiz_id[1]}</td>
            <td className="td text-xs">{fmtDateTime(odooDate(a.started_at))}</td><td className="td"><Badge value={a.state} />{a.late_submission && <span className="ml-1 text-xs text-warn">late</span>}</td>
            <td className="td">{a.marks_obtained}/{a.total_marks} ({fmtPct(a.percentage)})</td><td className="td"><Badge value={a.result_status} /></td></tr>
        ))}
      </DataTable>
      <Pagination total={d.total} page={page} pageSize={PAGE_SIZE} base="/admin/attempts" params={{ q: sp.q, state: sp.state }} />
    </>
  );
}
