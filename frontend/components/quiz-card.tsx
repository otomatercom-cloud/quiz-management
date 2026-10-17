import Link from "next/link";
import { Badge, cn } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { QuizCard } from "@/types";

export function QuizCardView({ q, href }: { q: QuizCard; href: string }) {
  return (
    <Link href={href} className="card block overflow-hidden transition hover:border-primary">
      {q.has_thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/thumb/${q.id}`} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-36 items-center justify-center bg-primary-light text-4xl font-bold text-primary" aria-hidden>
          {q.title.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="space-y-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">{q.subject || "General"}</span>
          {q.scholarship_enabled && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-warn">Scholarship</span>}
        </div>
        <h3 className="line-clamp-2 text-lg font-semibold">{q.title}</h3>
        <p className="text-sm text-muted">{fmtDateTime(q.quiz_start)} · {q.duration_minutes} min · {q.total_marks} marks</p>
        <div className="flex items-center gap-2">
          <Badge value={q.registration_status ?? (q.window_open ? "published" : "draft")} label={q.registration_status === "registered" && q.approval_required ? "Awaiting approval" : q.registration_status ?? (q.window_open ? "Open now" : "Upcoming")} />
          <span className={cn("text-xs", q.registration_open ? "text-ok" : "text-muted")}>
            {q.registration_required ? ((q.registration_open ? "Registration open" : "Registration closed") + (q.approval_required ? " · approval needed" : "")) : "Open to everyone — no registration"}
          </span>
        </div>
      </div>
    </Link>
  );
}
