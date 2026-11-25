"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { postJson } from "@/components/forms";
import { RegisterQuizButton, StartQuizButton } from "@/components/student-actions";
import { cn } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { QuizCard, RoomDetail } from "@/types";

export function JoinRoomButton({ roomId, mode, membership, compact }: { roomId: string; mode: string; membership: string | null; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (membership === "approved") return <span className="text-xs font-bold text-ok">Joined</span>;
  if (membership === "pending") return <span className="text-xs font-bold text-warn">Request sent</span>;
  if (mode === "invite") return <span className="text-xs text-muted">Invite only</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button disabled={busy} className={cn("rounded-full bg-primary px-4 font-bold text-white disabled:opacity-60", compact ? "min-h-[32px] text-xs" : "min-h-[44px] text-sm")}
        onClick={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          try { await postJson("/api/student/join_room", { room_public_id: roomId }); router.refresh(); }
          catch (err) { setError((err as Error).message); } finally { setBusy(false); }
        }}>
        {busy ? "Please wait…" : mode === "approval" ? "Request to join" : "Join room"}
      </button>
      {error && <span className="text-xs text-bad" role="alert">{error}</span>}
    </span>
  );
}

export function LeaveRoomButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} className="text-xs font-semibold text-white/90 underline"
      onClick={async () => {
        if (!confirm("Leave this room? You will lose access to its quizzes.")) return;
        setBusy(true);
        try { await postJson("/api/student/leave_room", { room_public_id: roomId }); router.push("/student/rooms"); router.refresh(); } finally { setBusy(false); }
      }}>Leave room</button>
  );
}

function QuizRow({ q }: { q: QuizCard }) {
  let action;
  if (q.active_attempt) action = <StartQuizButton quizId={q.id} resume duration={q.duration_minutes} />;
  else if (q.can_start) action = <StartQuizButton quizId={q.id} duration={q.duration_minutes} />;
  else if (q.registration_required && !q.registration_status) action = <RegisterQuizButton quizId={q.id} open={q.registration_open} required />;
  else if (q.registration_status === "registered" && q.approval_required) action = <span className="text-xs font-bold text-warn">Awaiting approval</span>;
  else action = <span className="text-xs text-muted">{q.window_open ? "Unavailable" : `Opens ${fmtDateTime(q.quiz_start)}`}</span>;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{q.subject || "General"}</p>
        <p className="truncate font-bold">{q.title}</p>
        <p className="text-xs text-muted">{q.question_total} Qs · {q.duration_minutes} min · pass {q.passing_percentage}% · up to 220 XP</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

const TABS = ["Feed", "Quizzes", "Leaderboard"] as const;

export function RoomTabs({ room }: { room: RoomDetail }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Feed");
  const quizzes = room.quizzes ?? [];
  const board = room.leaderboard;
  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("min-h-[40px] whitespace-nowrap rounded-full px-4 text-sm font-semibold", tab === t ? "bg-primary text-white" : "bg-white text-slate-700")}>{t}</button>
        ))}
      </div>

      {tab === "Feed" && (
        <div className="space-y-3">
          {room.posts?.map((p) => (
            <article key={p.id} className="card space-y-2 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-green-100 text-sm font-extrabold text-green-800" aria-hidden>{p.author.slice(0, 1)}</span>
                <div><p className="text-sm font-bold">{p.author} <span className="ml-1 rounded-full bg-primary-light px-2 py-0.5 text-[11px] text-primary">Teacher</span></p>
                  <p className="text-xs text-muted">{p.pinned ? "Pinned · " : ""}{fmtDateTime(p.created)}</p></div>
              </div>
              <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.body}</p>
            </article>
          ))}
          {quizzes.slice(0, 3).map((q) => (
            <article key={q.id} className="card space-y-2 p-4">
              <p className="text-xs font-semibold text-muted">New quiz</p>
              <QuizRow q={q} />
            </article>
          ))}
          {!room.posts?.length && !quizzes.length && <p className="card p-6 text-center text-sm text-muted">Nothing here yet. Announcements and new quizzes will appear in this feed.</p>}
        </div>
      )}

      {tab === "Quizzes" && (
        <div className="space-y-2">
          {quizzes.length ? quizzes.map((q) => <QuizRow key={q.id} q={q} />) : <p className="card p-6 text-center text-sm text-muted">No open quizzes in this room right now.</p>}
        </div>
      )}

      {tab === "Leaderboard" && (
        <div className="card space-y-3 p-4">
          <p className="text-sm font-bold">Top players · last {board?.days ?? 7} days</p>
          {board?.top.length ? board.top.map((r) => (
            <div key={r.rank + r.nickname} className={cn("flex items-center gap-3 rounded-xl p-1", r.me && "bg-primary-light")}>
              <span className="w-6 text-center font-extrabold text-slate-600">{r.rank}</span>
              <Avatar kind={r.avatar} own={r.me} size={36} />
              <span className={cn("flex-1 text-sm font-semibold", r.me && "text-primary")}>{r.me ? `${r.nickname} (you)` : r.nickname}</span>
              <span className="text-sm text-muted">{r.xp} XP</span>
            </div>
          )) : <p className="text-sm text-muted">No XP earned yet. Finish a quiz to get on the board.</p>}
          {board?.me && !board.top.some((r) => r.me) && (
            <div className="flex items-center gap-3 border-t border-slate-200 pt-3">
              <span className="w-6 text-center font-extrabold text-primary">{board.me.rank}</span>
              <Avatar kind={board.me.avatar} own size={36} />
              <span className="flex-1 text-sm font-bold text-primary">{board.me.nickname} (you)</span>
              <span className="text-sm text-muted">{board.me.xp} XP</span>
            </div>
          )}
          <p className="text-xs text-muted">Only nicknames and characters are shown to other students.</p>
        </div>
      )}
    </div>
  );
}
