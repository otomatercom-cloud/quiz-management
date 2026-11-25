import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorPanel } from "@/components/ui";
import { JoinRoomButton, LeaveRoomButton, RoomTabs } from "@/components/room-client";
import { requireStudent } from "@/lib/auth/session";
import { OdooError } from "@/lib/odoo/client";
import { studentRoom } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room" };

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{16}$/.test(id)) notFound();
  const s = await requireStudent();
  let r;
  try { r = await studentRoom(s.partnerId, id); }
  catch (e) { if (e instanceof OdooError && e.kind === "user") notFound(); return <ErrorPanel error={e} />; }
  const parentId = r.parent?.id;
  const classId = parentId ?? r.id;
  const root = r.parent ? r.parent.name : r.name;
  const subjects = r.parent ? [] : r.subjects;
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl text-white" style={{ background: r.color }}>
        <div className="space-y-3 p-5">
          <p className="text-xs font-semibold opacity-90">
            <Link href="/student/rooms" className="underline">Rooms</Link>
            {r.parent && <> › <Link href={`/student/rooms/${r.parent.id}`} className="underline">{r.parent.name}</Link></>}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex-1 text-2xl font-extrabold">{r.parent ? `${root} · ${r.name}` : r.name}</h1>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">{r.members} members</span>
            {!r.locked && !r.parent && <LeaveRoomButton roomId={r.id} />}
          </div>
          {r.description && <p className="text-sm opacity-90">{r.description}</p>}
          {r.teachers.length > 0 && <p className="text-xs opacity-90">Teachers: {r.teachers.join(", ")}</p>}
          {(r.parent || r.subjects.length > 0) && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Link href={`/student/rooms/${classId}`} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${r.parent ? "bg-white/20" : "bg-white text-primary"}`}>All subjects</Link>
              {(r.parent ? [] : subjects).map((c) => <Link key={c.id} href={`/student/rooms/${c.id}`} className="whitespace-nowrap rounded-full bg-white/20 px-3.5 py-1.5 text-sm font-semibold">{c.name}</Link>)}
              {r.parent && <span className="whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-primary">{r.name}</span>}
            </div>
          )}
        </div>
      </section>
      {r.locked ? (
        <div className="card space-y-3 p-6 text-center">
          <p className="font-bold">{r.membership === "pending" ? "Your request is waiting for approval." : "Join this room to see its quizzes and leaderboard."}</p>
          <JoinRoomButton roomId={r.parent ? r.parent.id : r.id} mode={r.access_mode} membership={r.membership} />
        </div>
      ) : <RoomTabs room={r} />}
    </div>
  );
}
