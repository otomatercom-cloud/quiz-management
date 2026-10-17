import { notFound } from "next/navigation";
import { ErrorPanel, PageHeader } from "@/components/ui";
import { QuestionForm, type QDraft } from "@/components/question-form";
import { requireStaff } from "@/lib/auth/session";
import { adminSearch } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit question" };

export default async function EditQuestion({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireStaff("manager");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  try {
    const r = await adminSearch<Record<string, any>>(s.userId, "otm.quiz.question", { // eslint-disable-line @typescript-eslint/no-explicit-any
      domain: [["id", "=", id], ["active", "in", [true, false]]], limit: 1,
      fields: ["question_text", "question_type", "subject", "topic", "difficulty", "marks", "negative_marks", "explanation", "option_ids", "usage_count"],
    });
    const q = r.records[0];
    if (!q) notFound();
    const opts = q.option_ids.length
      ? (await adminSearch<{ id: number; option_text: string; is_correct: boolean }>(s.userId, "otm.quiz.question.option", { domain: [["id", "in", q.option_ids]], fields: ["option_text", "is_correct"], order: "sequence, id" }).catch(() => ({ records: [] }))).records : [];
    const initial: QDraft = {
      id, question_text: q.question_text, question_type: q.question_type, subject: q.subject || "", topic: q.topic || "", difficulty: q.difficulty,
      marks: q.marks, negative_marks: q.negative_marks, explanation: q.explanation || "", options: opts.map((o) => ({ id: o.id, option_text: o.option_text, is_correct: o.is_correct })),
      locked: false,
    };
    return (<><PageHeader title={`Question #${id}`} subtitle={q.usage_count ? `Used in ${q.usage_count} quiz(zes)` : undefined} /><QuestionForm initial={initial} /></>);
  } catch (e) { return <ErrorPanel error={e} />; }
}
