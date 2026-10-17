import Link from "next/link";
import { DataTable, ErrorPanel, PageHeader, Pagination } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { adminSearch, pageOf, PAGE_SIZE } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question pools" };
type Row = { id: number; name: string; quiz_id: [number, string]; subject: string | false; topic: string | false; difficulty: string; question_type: string; questions_to_select: number; eligible_count: number };

export default async function Pools({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("manager");
  const page = pageOf((await searchParams).page);
  let d;
  try { d = await adminSearch<Row>(s.userId, "otm.quiz.question.pool", { page, order: "id desc", fields: ["name", "quiz_id", "subject", "topic", "difficulty", "question_type", "questions_to_select", "eligible_count"] }); }
  catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Question pools" subtitle="Pools are defined per quiz in the quiz wizard; this is a read-only overview." />
      <DataTable head={["Pool", "Quiz", "Filter", "Selects", "Eligible"]} empty={!d.records.length}>
        {d.records.map((p) => (
          <tr key={p.id}><td className="td">{p.name}</td><td className="td"><Link className="text-primary" href="/admin/quizzes">{p.quiz_id[1]}</Link></td>
            <td className="td text-xs">{[p.subject, p.topic, p.difficulty, p.question_type].filter(Boolean).join(" · ")}</td>
            <td className="td">{p.questions_to_select}</td>
            <td className={`td ${p.eligible_count < p.questions_to_select ? "font-semibold text-bad" : ""}`}>{p.eligible_count}</td></tr>
        ))}
      </DataTable>
      <Pagination total={d.total} page={page} pageSize={PAGE_SIZE} base="/admin/question-pools" />
    </>
  );
}
