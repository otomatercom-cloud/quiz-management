import { DataTable, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, odooDate } from "@/lib/format";
import { adminSearch, pageOf, PAGE_SIZE, textDomain } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };
type Row = { id: number; create_date: string; event: string; user_id: [number, string] | false; res_model: string | false; res_id: number; details: string | false };

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("admin");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  let d;
  try { d = await adminSearch<Row>(s.userId, "otm.quiz.audit.log", { domain: textDomain(sp.q, ["event", "details"]), page, order: "id desc", fields: ["create_date", "event", "user_id", "res_model", "res_id", "details"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Audit log" subtitle="Immutable record of sensitive actions." />
      <SearchBar action="/admin/audit" q={sp.q} placeholder="Event or details" />
      <DataTable head={["When", "User", "Event", "Record", "Details"]} empty={!d.records.length}>
        {d.records.map((r) => (
          <tr key={r.id}><td className="td text-xs">{fmtDateTime(odooDate(r.create_date))}</td><td className="td">{r.user_id ? r.user_id[1] : "—"}</td>
            <td className="td font-mono text-xs">{r.event}</td><td className="td text-xs">{r.res_model ? `${r.res_model} #${r.res_id}` : "—"}</td><td className="td max-w-md text-xs text-muted">{r.details || ""}</td></tr>
        ))}
      </DataTable>
      <Pagination total={d.total} page={page} pageSize={PAGE_SIZE} base="/admin/audit" params={{ q: sp.q }} />
    </>
  );
}
