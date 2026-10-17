import Link from "next/link";
import { Badge, ButtonLink, DataTable, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, odooDate } from "@/lib/format";
import { adminSearch, pageOf, PAGE_SIZE, textDomain } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quizzes" };

type Row = { id: number; public_id: string; name: string; code: string | false; state: string; quiz_start: string | false; quiz_end: string | false; total_marks: number; registration_count: number; completed_count: number };

export default async function AdminQuizzes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("manager");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const domain = [...(sp.state ? [["state", "=", sp.state]] : []), ...textDomain(sp.q, ["name", "code"])];
  let data;
  try {
    data = await adminSearch<Row>(s.userId, "otm.quiz", {
      domain, page, order: "id desc",
      fields: ["public_id", "name", "code", "state", "quiz_start", "quiz_end", "total_marks", "registration_count", "completed_count"],
    });
  } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Quizzes" actions={<ButtonLink href="/admin/quizzes/new">New quiz</ButtonLink>} />
      <SearchBar action="/admin/quizzes" q={sp.q} placeholder="Search by title or code">
        <select name="state" defaultValue={sp.state ?? ""} className="input max-w-40" aria-label="Status">
          <option value="">All statuses</option>
          {["draft", "published", "closed", "cancelled", "archived"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </SearchBar>
      <DataTable head={["Code", "Quiz", "Window", "Marks", "Registered", "Completed", "Status"]} empty={!data.records.length}>
        {data.records.map((q) => (
          <tr key={q.id}>
            <td className="td font-mono text-xs">{q.code || "—"}</td>
            <td className="td"><Link className="font-medium text-primary" href={`/admin/quizzes/${q.public_id}`}>{q.name}</Link></td>
            <td className="td text-xs">{fmtDateTime(odooDate(q.quiz_start || null))}<br />{fmtDateTime(odooDate(q.quiz_end || null))}</td>
            <td className="td">{q.total_marks}</td><td className="td">{q.registration_count}</td><td className="td">{q.completed_count}</td>
            <td className="td"><Badge value={q.state} /></td>
          </tr>
        ))}
      </DataTable>
      <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} base="/admin/quizzes" params={{ q: sp.q, state: sp.state }} />
    </>
  );
}
