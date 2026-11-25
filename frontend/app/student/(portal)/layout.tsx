import { StudentShell } from "@/components/student-shell";
import { requireStudent } from "@/lib/auth/session";
import { studentStats } from "@/lib/services/student";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStudent({ guestOk: true });
  if (s.guest) return <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>; // guests see only their result
  let head = { nickname: s.name.split(" ")[0], avatar: "fox", level: 1, xp: 0 };
  try {
    const st = await studentStats(s.partnerId);
    head = { nickname: st.identity.nickname, avatar: st.identity.avatar, level: st.level, xp: st.xp };
  } catch { /* header falls back to defaults; pages show their own error panel */ }
  return <StudentShell {...head}>{children}</StudentShell>;
}
