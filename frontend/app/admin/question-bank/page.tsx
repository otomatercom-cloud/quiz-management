import { ButtonLink, ErrorPanel, PageHeader, Pagination, SearchBar } from "@/components/ui";
import { QuestionTable, type QRow } from "@/components/question-table";
import { requireStaff } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session-core";
import { adminSearch, pageOf, PAGE_SIZE, textDomain } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question bank" };

export default async function QuestionBank({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("teacher");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const manager = hasRole(s.roles, "manager");
  const domain = [["active", "in", sp.archived ? [false] : [true]], ...(sp.type ? [["question_type", "=", sp.type]] : []), ...(sp.difficulty ? [["difficulty", "=", sp.difficulty]] : []), ...textDomain(sp.q, ["question_text", "subject", "topic"])];
  let data;
  try { data = await adminSearch<QRow>(s.userId, "otm.quiz.question", { domain, page, order: "id desc", fields: ["question_text", "question_type", "subject", "topic", "difficulty", "marks", "usage_count", "active", "create_uid"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title={manager ? "Question bank" : "My questions"}
        subtitle={manager ? undefined : "You see only the questions you added."}
        actions={<><ButtonLink href="/admin/questions/new">New question</ButtonLink><ButtonLink href="/admin/import" variant="outline">Import</ButtonLink>
          <a className="btn-outline" href="/api/admin/files/questions">Export CSV</a>
          {hasRole(s.roles, "admin") && <a className="btn-outline" href="/api/admin/files/answer-key">Export with answers</a>}</>} />
      <SearchBar action="/admin/question-bank" q={sp.q} placeholder="Search text, subject, topic">
        <select name="type" defaultValue={sp.type ?? ""} className="input max-w-40" aria-label="Type"><option value="">All types</option><option value="mcq">MCQ</option><option value="true_false">True/False</option><option value="descriptive">Descriptive</option></select>
        <select name="difficulty" defaultValue={sp.difficulty ?? ""} className="input max-w-36" aria-label="Difficulty"><option value="">Any difficulty</option>{["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}</select>
        <select name="archived" defaultValue={sp.archived ?? ""} className="input max-w-36" aria-label="Archived"><option value="">Active</option><option value="1">Archived</option></select>
      </SearchBar>
      <QuestionTable rows={data.records} showAuthor={manager} />
      <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} base="/admin/question-bank" params={{ q: sp.q, type: sp.type, difficulty: sp.difficulty, archived: sp.archived }} />
    </>
  );
}
