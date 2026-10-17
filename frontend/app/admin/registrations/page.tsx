import { ActionButton } from "@/components/forms";
import { Badge, DataTable, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, odooDate } from "@/lib/format";
import { adminSearch, pageOf, PAGE_SIZE, textDomain } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations" };
type Row = { id: number; reference: string; quiz_id: [number, string]; student_id: [number, string]; registration_date: string; state: string };

export default async function Registrations({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("manager");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const domain = [...(sp.state ? [["state", "=", sp.state]] : []), ...(sp.q ? ["|", ["student_id.name", "ilike", sp.q], ["quiz_id.name", "ilike", sp.q]] : [])];
  void textDomain;
  let d;
  try { d = await adminSearch<Row>(s.userId, "otm.quiz.registration", { domain, page, order: "id desc", fields: ["reference", "quiz_id", "student_id", "registration_date", "state"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  const act = (id: number, method: string, label: string, confirm?: string) => <ActionButton key={method} url="/api/admin/call" body={{ model: "otm.quiz.registration", ids: [id], method }} label={label} confirm={confirm} />;
  return (
    <>
      <PageHeader title="Registrations" />
      <SearchBar action="/admin/registrations" q={sp.q} placeholder="Student or quiz">
        <select name="state" defaultValue={sp.state ?? ""} className="input max-w-40" aria-label="Status"><option value="">All</option>{["registered", "confirmed", "cancelled", "disqualified"].map((x) => <option key={x}>{x}</option>)}</select>
      </SearchBar>
      <DataTable head={["Ref", "Student", "Quiz", "Registered", "Status", "Actions"]} empty={!d.records.length}>
        {d.records.map((r) => (
          <tr key={r.id}><td className="td font-mono text-xs">{r.reference}</td><td className="td">{r.student_id[1]}</td><td className="td">{r.quiz_id[1]}</td>
            <td className="td text-xs">{fmtDateTime(odooDate(r.registration_date))}</td><td className="td"><Badge value={r.state} /></td>
            <td className="td"><div className="flex flex-wrap gap-1">
              {r.state === "registered" && act(r.id, "action_confirm", "Approve")}
              {["registered", "confirmed"].includes(r.state) && act(r.id, "action_cancel", "Reject / cancel", "Reject this registration? The student will not be able to start the quiz.")}
              {["registered", "confirmed"].includes(r.state) && act(r.id, "action_disqualify", "Disqualify", "Disqualify this student? They cannot start the quiz.")}
            </div></td></tr>
        ))}
      </DataTable>
      <Pagination total={d.total} page={page} pageSize={PAGE_SIZE} base="/admin/registrations" params={{ q: sp.q, state: sp.state }} />
    </>
  );
}
