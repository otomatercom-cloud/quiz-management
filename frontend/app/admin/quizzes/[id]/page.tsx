import { notFound } from "next/navigation";
import { ActionButton } from "@/components/forms";
import { Alert, Badge, ButtonLink, DataTable, ErrorPanel, PageHeader, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { fmtDateTime, fmtPct, odooDate } from "@/lib/format";
import { adminSearch } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz" };

type Q = {
  id: number; public_id: string; name: string; code: string | false; state: string; subject: string | false; quiz_start: string | false; quiz_end: string | false;
  duration_minutes: number; passing_percentage: number; maximum_attempts: number; total_marks: number; validation_errors: string | false;
  registration_count: number; completed_count: number; passed_count: number; failed_count: number; results_published: boolean;
  show_results_immediately: boolean; scholarship_enabled: boolean; fixed_question_ids: number[]; question_pool_ids: number[]; scholarship_rule_ids: number[];
};

export default async function QuizDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireStaff("manager");
  const { id } = await params;
  let q: Q | undefined;
  try {
    const r = await adminSearch<Q>(s.userId, "otm.quiz", {
      domain: [["public_id", "=", id]], limit: 1,
      fields: ["public_id", "name", "code", "state", "subject", "quiz_start", "quiz_end", "duration_minutes", "passing_percentage", "maximum_attempts", "total_marks", "validation_errors",
        "registration_count", "completed_count", "passed_count", "failed_count", "results_published", "show_results_immediately", "scholarship_enabled", "fixed_question_ids", "question_pool_ids", "scholarship_rule_ids"],
    });
    q = r.records[0];
  } catch (e) { return <ErrorPanel error={e} />; }
  if (!q) notFound();
  const call = (method: string, label: string, opt: { confirm?: string; variant?: "primary" | "outline" | "danger" } = {}) => (
    <ActionButton key={method} url="/api/admin/call" body={{ model: "otm.quiz", ids: [q!.id], method }} label={label} {...opt} />
  );
  const pools = q.question_pool_ids.length
    ? (await adminSearch<{ id: number; name: string; questions_to_select: number; eligible_count: number }>(s.userId, "otm.quiz.question.pool", { domain: [["id", "in", q.question_pool_ids]], fields: ["name", "questions_to_select", "eligible_count"] }).catch(() => ({ records: [] }))).records : [];
  const rules = q.scholarship_rule_ids.length
    ? (await adminSearch<{ id: number; name: string; minimum_percentage: number; scholarship_value: number; scholarship_type: string; sequence: number }>(s.userId, "otm.quiz.scholarship.rule", { domain: [["id", "in", q.scholarship_rule_ids]], fields: ["name", "minimum_percentage", "scholarship_value", "scholarship_type", "sequence"], order: "sequence" }).catch(() => ({ records: [] }))).records : [];
  return (
    <>
      <PageHeader title={q.name} subtitle={`${q.code || ""} ${q.subject || ""}`.trim()} actions={<><Badge value={q.state} /><ButtonLink href={`/admin/reports?quiz=${q.public_id}`} variant="outline">Report</ButtonLink></>} />
      {q.validation_errors && q.state === "draft" && <Alert tone="warning"><strong>Fix before publishing:</strong><pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{q.validation_errors}</pre></Alert>}
      <div className="my-4 flex flex-wrap gap-2">
        {q.state === "draft" && call("action_publish", "Publish", { variant: "primary" })}
        {q.state === "published" && call("action_close", "Close quiz", { confirm: "Students will no longer be able to start or continue attempts after closing." })}
        {["draft", "published"].includes(q.state) && call("action_cancel", "Cancel quiz", { variant: "danger", confirm: "Cancel this quiz? Registrations will stay but the quiz becomes unavailable." })}
        {q.state === "closed" && !q.show_results_immediately && !q.results_published && call("action_publish_results", "Publish results", { variant: "primary" })}
        {["closed", "cancelled"].includes(q.state) && call("action_archive_quiz", "Archive")}
        {["cancelled", "closed", "archived"].includes(q.state) && call("action_reset_draft", "Reset to draft", { confirm: "Move back to draft? Only possible when no attempts exist." })}
        {q.scholarship_enabled && call("action_recalculate_scholarships", "Recalculate scholarships", { confirm: "Recompute eligibility from current rules? Approved awards and overrides are kept." })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total marks" value={q.total_marks} /><Stat label="Registered" value={q.registration_count} />
        <Stat label="Completed" value={q.completed_count} hint={`${q.passed_count} passed · ${q.failed_count} failed`} /><Stat label="Pass mark" value={fmtPct(q.passing_percentage)} />
      </div>
      <section className="card mt-6 grid gap-3 p-5 text-sm sm:grid-cols-2">
        <p><span className="text-muted">Starts:</span> {fmtDateTime(odooDate(q.quiz_start || null))}</p>
        <p><span className="text-muted">Ends:</span> {fmtDateTime(odooDate(q.quiz_end || null))}</p>
        <p><span className="text-muted">Duration:</span> {q.duration_minutes} min</p>
        <p><span className="text-muted">Attempts allowed:</span> {q.maximum_attempts}</p>
        <p><span className="text-muted">Fixed questions:</span> {q.fixed_question_ids.length}</p>
        <p><span className="text-muted">Random pools:</span> {pools.length}</p>
      </section>
      <p className="mt-2 text-xs text-muted">Structure and marking settings lock automatically once students have attempted the quiz; use Odoo back-office for advanced edits on a draft.</p>
      {pools.length > 0 && <><h2 className="mb-2 mt-6 font-semibold">Pools</h2><DataTable head={["Pool", "Selects", "Available"]}>{pools.map((p) => <tr key={p.id}><td className="td">{p.name}</td><td className="td">{p.questions_to_select}</td><td className="td">{p.eligible_count}</td></tr>)}</DataTable></>}
      {rules.length > 0 && <><h2 className="mb-2 mt-6 font-semibold">Scholarship rules</h2><DataTable head={["Priority", "Rule", "From %", "Benefit"]}>{rules.map((r) => <tr key={r.id}><td className="td">{r.sequence}</td><td className="td">{r.name}</td><td className="td">{r.minimum_percentage}</td><td className="td">{r.scholarship_value}{r.scholarship_type === "percentage" ? "%" : ""}</td></tr>)}</DataTable></>}
    </>
  );
}
