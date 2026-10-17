import { PageHeader } from "@/components/ui";
import { QuizWizard } from "@/components/quiz-wizard";
import { requireStaff } from "@/lib/auth/session";

export const metadata = { title: "New quiz" };

export default async function NewQuiz() {
  await requireStaff("manager");
  return (
    <>
      <PageHeader title="Create a quiz" subtitle="Six short steps — nothing is visible to students until you publish." />
      <QuizWizard />
    </>
  );
}
