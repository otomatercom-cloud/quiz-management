import { AppShell } from "@/components/shell";
import { requireStudent } from "@/lib/auth/session";

const ITEMS = [
  { href: "/student/dashboard", label: "Dashboard" },
  { href: "/student/quizzes", label: "Quizzes" },
  { href: "/student/registrations", label: "My registrations" },
  { href: "/student/results", label: "Results" },
  { href: "/student/scholarships", label: "Scholarships" },
  { href: "/student/profile", label: "Profile" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStudent();
  return <AppShell brand="Otomater Quizzes" items={ITEMS} user={s.name}>{children}</AppShell>;
}
