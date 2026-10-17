import { Badge, DataTable, ErrorPanel, PageHeader, Pagination } from "@/components/ui";
import { CancelRegistrationButton } from "@/components/student-actions";
import { requireStudent } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { pageOf } from "@/lib/services/admin";
import { myRegistrations } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "My registrations" };

export default async function Registrations({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStudent();
  const page = pageOf((await searchParams).page);
  let data;
  try { data = await myRegistrations(s.partnerId, page); } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="My registrations" />
      <DataTable head={["Reference", "Quiz", "Quiz starts", "Registered", "Status", ""]} empty={!data.items.length}>
        {data.items.map((r) => (
          <tr key={r.id}>
            <td className="td font-mono text-xs">{r.reference}</td>
            <td className="td font-medium">{r.quiz.title}</td>
            <td className="td">{fmtDateTime(r.quiz.quiz_start)}</td>
            <td className="td">{fmtDateTime(r.date)}</td>
            <td className="td"><Badge value={r.state} /></td>
            <td className="td">{(r.state === "registered" || r.state === "confirmed") && r.quiz.registration_open && <CancelRegistrationButton id={r.id} />}</td>
          </tr>
        ))}
      </DataTable>
      <Pagination total={data.total} page={page} pageSize={20} base="/student/registrations" />
    </>
  );
}
