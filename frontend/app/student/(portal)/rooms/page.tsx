import Link from "next/link";
import { ErrorPanel } from "@/components/ui";
import { JoinRoomButton } from "@/components/room-client";
import { requireStudent } from "@/lib/auth/session";
import { studentRooms } from "@/lib/services/student";
import type { RoomCard } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rooms" };

function Card({ r }: { r: RoomCard }) {
  return (
    <div className="card overflow-hidden">
      <Link href={`/student/rooms/${r.id}`} className="block">
        <div className="h-16" style={{ background: r.color }} aria-hidden />
        <div className="space-y-2 p-4">
          <p className="text-lg font-extrabold">{r.name}</p>
          {r.description && <p className="line-clamp-2 text-sm text-muted">{r.description}</p>}
          {!!r.subjects.length && (
            <div className="flex flex-wrap gap-1.5">
              {r.subjects.slice(0, 4).map((s) => <span key={s.id} className="rounded-full bg-primary-light px-2.5 py-1 text-xs font-bold text-primary">{s.name}</span>)}
              {r.subjects.length > 4 && <span className="rounded-full bg-primary-light px-2.5 py-1 text-xs font-bold text-primary">+{r.subjects.length - 4}</span>}
            </div>
          )}
        </div>
      </Link>
      <div className="flex items-center justify-between px-4 pb-4 text-xs text-muted">
        <span>{r.members} members</span>
        <JoinRoomButton roomId={r.id} mode={r.access_mode} membership={r.membership} compact />
      </div>
    </div>
  );
}

export default async function Rooms() {
  const s = await requireStudent();
  let d;
  try { d = await studentRooms(s.partnerId); } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Rooms</h1>
      <section className="space-y-3">
        <h2 className="font-bold">My rooms</h2>
        {d.mine.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.mine.map((r) => <Card key={r.id} r={r} />)}</div>
          : <p className="card p-6 text-center text-sm text-muted">You have not joined a room yet. Join your class room below to see its quizzes.</p>}
      </section>
      {!!d.explore.length && (
        <section className="space-y-3">
          <h2 className="font-bold">Explore</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.explore.map((r) => <Card key={r.id} r={r} />)}</div>
        </section>
      )}
    </div>
  );
}
