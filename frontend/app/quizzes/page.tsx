import type { Metadata } from "next";
import { PublicHeader } from "@/components/public-header";
import { QuizCardView } from "@/components/quiz-card";
import { EmptyState, ErrorPanel, Pagination, SearchBar } from "@/components/ui";
import { pageOf } from "@/lib/services/admin";
import { publicQuizzes } from "@/lib/services/student";

export const metadata: Metadata = { title: "Quizzes" };
export const dynamic = "force-dynamic";

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = pageOf(sp.page);
  let data, error: unknown;
  try { data = await publicQuizzes(sp.q ?? "", page, 12); } catch (e) { error = e; }
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 text-3xl font-bold">Available quizzes</h1>
        <SearchBar action="/quizzes" q={sp.q} placeholder="Search quizzes" />
        {error ? <ErrorPanel error={error} /> : data && data.items.length ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((q) => <QuizCardView key={q.id} q={q} href={`/quizzes/${q.slug}`} />)}</div>
            <Pagination total={data.total} page={page} pageSize={12} base="/quizzes" params={{ q: sp.q }} />
          </>
        ) : <EmptyState title="No quizzes found" text="Try a different search." />}
      </main>
    </>
  );
}
