import Link from "next/link";
import { Badge, ButtonLink, EmptyState, ErrorPanel } from "@/components/ui";
import { QuizCardView } from "@/components/quiz-card";
import { requireStudent } from "@/lib/auth/session";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { studentDashboard, studentStats } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

const TZ = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export default async function Home() {
  const s = await requireStudent();
  let d, st;
  try { [d, st] = await Promise.all([studentDashboard(s.partnerId), studentStats(s.partnerId)]); }
  catch (e) { return <ErrorPanel error={e} />; }

  const next = d.available.find((q) => q.window_open) ?? d.available[0];
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, i) => new Date(today.getTime() + (i - today.getDay()) * 86400000));
  const busyDays = new Set(d.available.filter((q) => q.quiz_start).map((q) => dayKey(new Date(q.quiz_start as string))));
  const pct = Math.round((st.xp_in_level / st.xp_per_level) * 100);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="text-2xl font-extrabold">{st.identity.nickname}</h1>
      </div>

      {d.active_attempt && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-primary bg-primary-light p-4">
          <div><p className="font-bold text-navy">Quiz in progress: {d.active_attempt.quiz_title}</p><p className="text-sm text-muted">Ends {fmtDateTime(d.active_attempt.deadline_at)}</p></div>
          <ButtonLink href={`/student/quiz/${d.active_attempt.id}`}>Resume</ButtonLink>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <h2 className="font-bold">Today&apos;s quiz</h2>
          {next ? (
            <div className="card space-y-2 rounded-3xl p-5">
              <p className="text-xs font-bold text-ok">{next.window_open ? "● Open now" : `Starts ${fmtDateTime(next.quiz_start)}`}</p>
              <p className="text-xl font-extrabold">{next.title}</p>
              <p className="text-sm text-muted">{next.subject || "General"} · {next.question_total} questions · {next.duration_minutes} min</p>
              <div className="h-1.5 rounded-full bg-slate-200"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted">{st.xp_per_level - st.xp_in_level} XP to Level {st.level + 1}</span>
                <ButtonLink href="/student/quizzes">{next.can_start ? "Start" : "View"}</ButtonLink>
              </div>
            </div>
          ) : <EmptyState title="No open quizzes" text="Join a room to see your class quizzes." action={<ButtonLink href="/student/rooms">Browse rooms</ButtonLink>} />}

          <div className="flex items-baseline justify-between pt-2"><h2 className="font-bold">Quiz calendar</h2>
            <span className="text-xs text-muted">{today.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: TZ })}</span></div>
          <div className="flex gap-1.5">
            {week.map((w) => {
              const key = dayKey(w), isToday = key === dayKey(today);
              return (
                <div key={key} className={`flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-full text-[11px] ${isToday ? "bg-primary text-blue-100" : "bg-white text-slate-600"}`}>
                  {w.toLocaleDateString("en-IN", { weekday: "short", timeZone: TZ })}
                  <b className={`text-sm ${isToday ? "text-white" : "text-ink"}`}>{w.toLocaleDateString("en-IN", { day: "numeric", timeZone: TZ })}</b>
                  <span className={`h-1 w-1 rounded-full ${busyDays.has(key) ? (isToday ? "bg-white" : "bg-primary") : "bg-transparent"}`} aria-hidden />
                </div>
              );
            })}
          </div>

          {d.available.length > 1 && (
            <>
              <h2 className="pt-2 font-bold">More quizzes</h2>
              <div className="grid gap-4 sm:grid-cols-2">{d.available.slice(0, 4).map((q) => <QuizCardView key={q.id} q={q} href="/student/quizzes" />)}</div>
            </>
          )}
        </section>

        <div className="space-y-4">
          <section className="card space-y-2 p-4">
            <h2 className="font-bold">Last quizzes</h2>
            {d.recent_results.length ? d.recent_results.map((r) => (
              <Link key={r.id} href={`/student/results/${r.id}`} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3 text-sm">
                <span className="font-semibold">{r.quiz_title}</span>
                {r.visible ? <span className="font-bold">{fmtPct(r.percentage)} <Badge value={r.result_status ?? "pending"} /></span> : <Badge value="pending" label="Awaiting release" />}
              </Link>
            )) : <p className="text-sm text-muted">No results yet.</p>}
          </section>
          <section className="card space-y-2 p-4">
            <h2 className="font-bold">Streak &amp; badges</h2>
            <p className="text-sm text-muted">{st.streak ? `${st.streak}-day streak` : "Finish a quiz today to start a streak."}</p>
            <div className="flex flex-wrap gap-1.5">{st.badges.filter((b) => b.earned).map((b) => <span key={b.key} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{b.label}</span>)}</div>
            <Link href="/student/stats" className="text-sm font-semibold text-primary">See all stats</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
