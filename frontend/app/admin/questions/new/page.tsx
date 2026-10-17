import { PageHeader } from "@/components/ui";
import { blankQuestion, QuestionForm } from "@/components/question-form";
import { requireStaff } from "@/lib/auth/session";

export const metadata = { title: "New question" };
export default async function NewQuestion() {
  await requireStaff("manager");
  return (<><PageHeader title="New question" /><QuestionForm initial={blankQuestion} /></>);
}
