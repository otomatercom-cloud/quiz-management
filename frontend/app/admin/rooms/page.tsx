import { ErrorPanel, PageHeader } from "@/components/ui";
import { RoomsAdmin, type RoomRow } from "@/components/rooms-admin";
import { requireStaff } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session-core";
import { odooCall } from "@/lib/odoo/client";
import { adminSearch } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rooms" };

export default async function Rooms() {
  const s = await requireStaff("teacher");
  const manager = hasRole(s.roles, "manager");
  try {
    const [rooms, quizzes, teachers] = await Promise.all([
      adminSearch<RoomRow>(s.userId, "otm.quiz.room", { limit: 200, order: "sequence, name", fields: ["name", "parent_id", "access_mode", "member_count", "description", "color", "teacher_ids", "quiz_ids", "active"] }),
      manager ? adminSearch<{ id: number; name: string }>(s.userId, "otm.quiz", { limit: 200, order: "id desc", fields: ["name"] }) : Promise.resolve({ total: 0, records: [] }),
      hasRole(s.roles, "admin") ? odooCall<{ id: number; name: string }[]>("admin_teachers", { acting_user_id: s.userId }) : Promise.resolve(null),
    ]);
    return (
      <>
        <PageHeader title="Rooms" subtitle="Class rooms and their subject rooms. A quiz placed in a room is visible only to that room's members." />
        <RoomsAdmin rooms={rooms.records} quizzes={quizzes.records} teachers={teachers} canManage={manager} />
      </>
    );
  } catch (e) { return <ErrorPanel error={e} />; }
}
