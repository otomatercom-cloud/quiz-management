import { PublicHeader } from "@/components/public-header";
import { QuizCardView } from "@/components/quiz-card";
import { ButtonLink, EmptyState } from "@/components/ui";
import { publicQuizzes } from "@/lib/services/student";
import type { QuizCard } from "@/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let quizzes: QuizCard[] = [];
  try { quizzes = (await publicQuizzes("", 1, 3)).items; } catch { /* backend unavailable: hero still renders */ }
  return (
    <>
      <PublicHeader />
      <main>
        <section className="bg-navy text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
            <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">Take the quiz. Earn your scholarship.</h1>
            <p className="mt-4 max-w-xl text-lg text-blue-100">Register for upcoming assessments, sit a fair, timed exam and see your result and scholarship eligibility instantly.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/register">Create student account</ButtonLink>
              <ButtonLink href="/quizzes" variant="outline">Browse quizzes</ButtonLink>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="mb-6 text-2xl font-bold">Upcoming quizzes</h2>
          {quizzes.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{quizzes.map((q) => <QuizCardView key={q.id} q={q} href={`/quizzes/${q.slug}`} />)}</div>
          ) : (
            <EmptyState title="No quizzes are open right now" text="Check back soon — new assessments are published regularly." />
          )}
        </section>
      </main>
    </>
  );
}
