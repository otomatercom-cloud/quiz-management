import { ErrorPanel } from "@/components/ui";
import { requireStudent } from "@/lib/auth/session";
import { studentStats } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats" };

export default async function Stats() {
  const s = await requireStudent();
  let d;
  try { d = await studentStats(s.partnerId); } catch (e) { return <ErrorPanel error={e} />; }
  const pct = Math.round((d.xp_in_level / d.xp_per_level) * 100);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">My stats</h1>
      <section className="card space-y-3 p-5">
        <div className="flex items-baseline justify-between"><p className="text-lg font-extrabold">Level {d.level}</p><p className="text-sm text-muted">{d.xp.toLocaleString()} XP total</p></div>
        <div className="h-3 rounded-full bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
        <p className="text-xs text-muted">{d.xp_per_level - d.xp_in_level} XP to Level {d.level + 1}</p>
        <div className="grid grid-cols-3 gap-3 pt-1 text-center">
          <div className="rounded-2xl bg-primary-light p-3"><p className="text-xl font-extrabold text-primary">{d.weekly_xp}</p><p className="text-xs text-muted">XP this week</p></div>
          <div className="rounded-2xl bg-amber-50 p-3"><p className="text-xl font-extrabold text-warn">{d.streak}</p><p className="text-xs text-muted">Day streak</p></div>
          <div className="rounded-2xl bg-green-50 p-3"><p className="text-xl font-extrabold text-ok">{d.quizzes_done}</p><p className="text-xs text-muted">Quizzes done</p></div>
        </div>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Badges</h2>
        <div className="flex flex-wrap gap-2">
          {d.badges.map((b) => (
            <span key={b.key} className={`rounded-full px-3 py-1.5 text-sm font-bold ${b.earned ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
              {b.label}{b.earned ? "" : " (locked)"}
            </span>
          ))}
        </div>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Subjects</h2>
        {d.subjects.length ? d.subjects.map((x) => (
          <div key={x.subject} className="space-y-1">
            <div className="flex justify-between text-sm"><span className="font-semibold">{x.subject}</span><span className="text-muted">{x.average}% avg · {x.attempts} quiz{x.attempts === 1 ? "" : "zes"} · {x.minutes} min</span></div>
            <div className="h-2.5 rounded-full bg-slate-200"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, x.average)}%` }} /></div>
          </div>
        )) : <p className="text-sm text-muted">Finish a quiz and your subject scores will show here.</p>}
      </section>
    </div>
  );
}
