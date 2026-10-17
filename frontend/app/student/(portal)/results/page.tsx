import Link from "next/link";
import { Badge, DataTable, ErrorPanel, PageHeader, Pagination } from "@/components/ui";
import { requireStudent } from "@/lib/auth/session";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { pageOf } from "@/lib/services/admin";
import { myResults } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results" };

export default async function Results({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStudent();
  const page = pageOf((await searchParams).page);
  let data;
  try { data = await myResults(s.partnerId, page); } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Results" />
      <DataTable head={["Quiz", "Attempt", "Submitted", "Marks", "Percentage", "Result", ""]} empty={!data.items.length}>
        {data.items.map((r) => (
          <tr key={r.id}>
            <td className="td font-medium">{r.quiz_title}</td>
            <td className="td">#{r.attempt_number}</td>
            <td className="td">{fmtDateTime(r.submitted_at)}</td>
            <td className="td">{r.visible ? `${r.marks_obtained} / ${r.total_marks}` : "—"}</td>
            <td className="td">{r.visible ? fmtPct(r.percentage) : "—"}</td>
            <td className="td"><Badge value={r.visible ? r.result_status ?? "pending" : "pending"} label={r.visible ? undefined : "Awaiting release"} /></td>
            <td className="td"><Link className="font-semibold text-primary" href={`/student/results/${r.id}`}>View</Link></td>
          </tr>
        ))}
      </DataTable>
      <Pagination total={data.total} page={page} pageSize={20} base="/student/results" />
    </>
  );
}
