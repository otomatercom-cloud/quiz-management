import { notFound, redirect } from "next/navigation";
import { ExamRunner } from "@/components/exam-runner";
import { requireStudent } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { getAttempt } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz" };

export default async function QuizPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const s = await requireStudent();
  const { attemptId } = await params;
  if (!/^[0-9a-f]{16}$/.test(attemptId)) notFound();
  let a;
  try { a = await getAttempt(s.partnerId, attemptId); } catch (e) {
    if (e instanceof OdooError && (e.kind === "forbidden" || e.kind === "user")) notFound();
    throw e;
  }
  if (a.finished) redirect(`/student/results/${attemptId}`); // submitted / expired -> receipt via results
  return (
    <ExamRunner attemptId={a.id} title={a.quiz.title} instructions={a.quiz.instructions} deadlineAt={a.deadline_at}
      serverNow={a.server_now} questions={a.questions} />
  );
}
