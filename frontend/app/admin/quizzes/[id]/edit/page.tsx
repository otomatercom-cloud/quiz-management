import { notFound } from "next/navigation";
import { ErrorPanel, PageHeader } from "@/components/ui";
import { QuizWizard, type WizardInitial } from "@/components/quiz-wizard";
import { requireStaff } from "@/lib/auth/session";
import { odooToLocalInput } from "@/lib/format";
import { adminSearch } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit quiz" };

const htmlToText = (h: string | false) =>
  (h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function EditQuiz({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireStaff("manager");
  const { id } = await params;
  try {
    const q = (await adminSearch<Record<string, any>>(s.userId, "otm.quiz", {
      domain: [["public_id", "=", id]], limit: 1,
      fields: ["public_id", "name", "state", "subject", "description", "instructions", "quiz_start", "quiz_end", "duration_minutes", "passing_percentage", "maximum_attempts",
        "negative_marking_enabled", "default_negative_marks", "randomize_questions", "randomize_options", "show_results_immediately", "show_correct_answers_after_submission",
        "registration_required", "approval_required", "registration_start", "registration_end", "registration_limit", "scholarship_enabled", "course_fee",
        "fixed_question_ids", "question_pool_ids", "scholarship_rule_ids"],
    })).records[0];
    if (!q) notFound();
    const pools = q.question_pool_ids.length ? (await adminSearch<any>(s.userId, "otm.quiz.question.pool", { domain: [["id", "in", q.question_pool_ids]], fields: ["name", "subject", "topic", "difficulty", "question_type", "questions_to_select", "marks_per_question"] })).records : [];
    const rules = q.scholarship_rule_ids.length ? (await adminSearch<any>(s.userId, "otm.quiz.scholarship.rule", { domain: [["id", "in", q.scholarship_rule_ids]], order: "sequence", fields: ["name", "minimum_percentage", "maximum_percentage", "scholarship_type", "scholarship_value", "sequence"] })).records : [];
    const initial: WizardInitial = {
      id: q.id, publicId: q.public_id, state: q.state, fixed: q.fixed_question_ids,
      pools: pools.map((p: any) => ({ id: p.id, name: p.name, subject: p.subject || "", topic: p.topic || "", difficulty: p.difficulty, question_type: p.question_type, questions_to_select: p.questions_to_select, marks_per_question: p.marks_per_question })),
      rules: rules.map((r: any) => ({ id: r.id, name: r.name, minimum_percentage: r.minimum_percentage, maximum_percentage: r.maximum_percentage, scholarship_type: r.scholarship_type, scholarship_value: r.scholarship_value, sequence: r.sequence })),
      values: {
        name: q.name, subject: q.subject || "", description: q.description || "", instructions: htmlToText(q.instructions),
        quiz_start: odooToLocalInput(q.quiz_start), quiz_end: odooToLocalInput(q.quiz_end),
        duration_minutes: q.duration_minutes, passing_percentage: q.passing_percentage, maximum_attempts: q.maximum_attempts,
        negative_marking_enabled: q.negative_marking_enabled, default_negative_marks: q.default_negative_marks,
        randomize_questions: q.randomize_questions, randomize_options: q.randomize_options,
        show_results_immediately: q.show_results_immediately, show_correct_answers_after_submission: q.show_correct_answers_after_submission,
        access: !q.registration_required ? "open" : q.approval_required ? "approval" : "auto", registration_required: q.registration_required,
        registration_start: odooToLocalInput(q.registration_start), registration_end: odooToLocalInput(q.registration_end), registration_limit: q.registration_limit,
        scholarship_enabled: q.scholarship_enabled, course_fee: q.course_fee,
      },
    };
    return (
      <>
        <PageHeader title={`Edit: ${q.name}`} subtitle={q.state === "draft" ? "Draft — change anything, then save or publish." : "Published quizzes lock their marking and question structure once students have attempted them; Odoo will tell you if a change is blocked."} />
        <QuizWizard initial={initial} />
      </>
    );
  } catch (e) { return <ErrorPanel error={e} />; }
}
