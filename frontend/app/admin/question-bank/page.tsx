import Link from "next/link";
import { ActionButton } from "@/components/forms";
import { Badge, ButtonLink, DataTable, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { adminSearch, pageOf, PAGE_SIZE, textDomain } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question bank" };
type Row = { id: number; question_text: string; question_type: string; subject: string | false; topic: string | false; difficulty: string; marks: number; usage_count: number; active: boolean };

export default async function QuestionBank({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("manager");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const domain = [["active", "in", sp.archived ? [false] : [true]], ...(sp.type ? [["question_type", "=", sp.type]] : []), ...(sp.difficulty ? [["difficulty", "=", sp.difficulty]] : []), ...textDomain(sp.q, ["question_text", "subject", "topic"])];
  let data;
  try { data = await adminSearch<Row>(s.userId, "otm.quiz.question", { domain, page, order: "id desc", fields: ["question_text", "question_type", "subject", "topic", "difficulty", "marks", "usage_count", "active"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Question bank" actions={<><ButtonLink href="/admin/questions/new">New question</ButtonLink><ButtonLink href="/admin/import" variant="outline">Import</ButtonLink></>} />
      <SearchBar action="/admin/question-bank" q={sp.q} placeholder="Search text, subject, topic">
        <select name="type" defaultValue={sp.type ?? ""} className="input max-w-40" aria-label="Type"><option value="">All types</option><option value="mcq">MCQ</option><option value="true_false">True/False</option><option value="descriptive">Descriptive</option></select>
        <select name="difficulty" defaultValue={sp.difficulty ?? ""} className="input max-w-36" aria-label="Difficulty"><option value="">Any difficulty</option>{["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}</select>
        <select name="archived" defaultValue={sp.archived ?? ""} className="input max-w-36" aria-label="Archived"><option value="">Active</option><option value="1">Archived</option></select>
      </SearchBar>
      <DataTable head={["Question", "Type", "Subject / topic", "Level", "Marks", "Used", ""]} empty={!data.records.length}>
        {data.records.map((r) => (
          <tr key={r.id}>
            <td className="td max-w-md"><Link className="line-clamp-2 text-primary" href={`/admin/questions/${r.id}`}>{r.question_text}</Link></td>
            <td className="td"><Badge value={r.question_type} /></td>
            <td className="td text-xs">{r.subject || "—"}{r.topic ? ` / ${r.topic}` : ""}</td>
            <td className="td">{r.difficulty}</td><td className="td">{r.marks}</td><td className="td">{r.usage_count}</td>
            <td className="td"><ActionButton url="/api/admin/call" body={{ model: "otm.quiz.question", ids: [r.id], method: r.active ? "action_archive_selected" : "action_activate_selected" }} label={r.active ? "Archive" : "Restore"} /></td>
          </tr>
        ))}
      </DataTable>
      <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} base="/admin/question-bank" params={{ q: sp.q, type: sp.type, difficulty: sp.difficulty, archived: sp.archived }} />
    </>
  );
}
