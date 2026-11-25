import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ExamRunner } from "@/components/exam-runner";
import { requireStudent } from "@/lib/auth/session";
import { Alert } from "@/components/ui";
import { odooCall, OdooError } from "@/lib/odoo/client";
import { sebAllowed } from "@/lib/seb";
import { getAttempt } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz" };

export default async function QuizPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const s = await requireStudent({ guestOk: true });
  const { attemptId } = await params;
  if (!/^[0-9a-f]{16}$/.test(attemptId)) notFound();
  let a;
  try { a = await getAttempt(s.partnerId, attemptId); } catch (e) {
    if (e instanceof OdooError && (e.kind === "forbidden" || e.kind === "user")) notFound();
    throw e;
  }
  if (a.finished) redirect(`/student/results/${attemptId}`); // submitted / expired -> receipt via results
  const integ = (a as { integrity?: { mode: "off" | "warn" | "strict"; max: number; count: number; seb_required: boolean; seb_key: string; calculator: boolean; spreadsheet: boolean } }).integrity;
  let inSeb = false;
  if (integ?.seb_required) {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    inSeb = sebAllowed(`${base}/student/quiz/${attemptId}`, integ.seb_key, (await headers()).get("x-safeexambrowser-configkeyhash"));
    if (!inSeb) {
      await odooCall("log_event", { partner_id: s.partnerId, attempt_public_id: attemptId, kind: "seb_missing" }).catch(() => undefined);
      return (
        <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
          <div className="card w-full space-y-3 p-8">
            <h1 className="text-xl font-bold">Open this quiz in Safe Exam Browser</h1>
            <Alert tone="warning">This quiz can only be taken in Safe Exam Browser with the exam configuration file given by your institute. Your time is already running, so start it there now.</Alert>
          </div>
        </main>
      );
    }
  }
  // seb_key stays on the server: only these fields go to the browser
  const publicIntegrity = integ && (integ.mode !== "off" || integ.calculator || integ.spreadsheet)
    ? { mode: integ.mode, max: integ.max, count: integ.count, calculator: integ.calculator, spreadsheet: integ.spreadsheet }
    : undefined;
  return (
    <ExamRunner integrity={publicIntegrity} inSeb={inSeb} attemptId={a.id} title={a.quiz.title} instructions={a.quiz.instructions} deadlineAt={a.deadline_at}
      serverNow={a.server_now} questions={a.questions} />
  );
}
