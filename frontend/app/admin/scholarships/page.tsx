import { ScholarshipActions } from "@/components/scholarship-actions";
import { Badge, DataTable, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtPct } from "@/lib/format";
import { hasRole } from "@/lib/auth/session-core";
import { adminSearch, pageOf, PAGE_SIZE } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scholarships" };
type Row = { id: number; reference: string; quiz_id: [number, string]; student_id: [number, string]; percentage: number; scholarship_status: string; scholarship_value: number; scholarship_type: string | false; scholarship_amount: number; scholarship_overridden: boolean; scholarship_explanation: string | false };

export default async function Scholarships({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("manager");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const status = sp.status ?? "eligible";
  const domain = status === "all" ? [["scholarship_status", "in", ["eligible", "approved", "rejected", "not_eligible"]]] : [["scholarship_status", "=", status]];
  let d;
  try { d = await adminSearch<Row>(s.userId, "otm.quiz.attempt", { domain, page, order: "id desc", fields: ["reference", "quiz_id", "student_id", "percentage", "scholarship_status", "scholarship_value", "scholarship_type", "scholarship_amount", "scholarship_overridden", "scholarship_explanation"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Scholarships" subtitle="Eligibility is calculated automatically; an award needs approval." />
      <SearchBar action="/admin/scholarships">
        <select name="status" defaultValue={status} className="input max-w-44" aria-label="Status">{["eligible", "approved", "rejected", "not_eligible", "all"].map((x) => <option key={x}>{x}</option>)}</select>
      </SearchBar>
      <DataTable head={["Student", "Quiz", "Score", "Benefit", "Status", "Actions"]} empty={!d.records.length}>
        {d.records.map((a) => (
          <tr key={a.id}><td className="td">{a.student_id[1]}</td><td className="td">{a.quiz_id[1]}</td><td className="td">{fmtPct(a.percentage)}</td>
            <td className="td text-xs">{a.scholarship_type ? `${a.scholarship_value}${a.scholarship_type === "percentage" ? "%" : ""} (${a.scholarship_amount})` : "—"}
              {a.scholarship_explanation && <span className="block text-muted">{a.scholarship_explanation}</span>}</td>
            <td className="td"><Badge value={a.scholarship_status} />{a.scholarship_overridden && <span className="ml-1 text-xs text-warn">override</span>}</td>
            <td className="td"><ScholarshipActions id={a.id} status={a.scholarship_status} isAdmin={hasRole(s.roles, "admin")} /></td></tr>
        ))}
      </DataTable>
      <Pagination total={d.total} page={page} pageSize={PAGE_SIZE} base="/admin/scholarships" params={{ status: sp.status }} />
    </>
  );
}
