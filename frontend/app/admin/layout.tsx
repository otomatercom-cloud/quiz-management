import { AppShell } from "@/components/shell";
import { requireStaff } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session-core";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff("evaluator");
  const manager = hasRole(s.roles, "manager");
  const items = manager
    ? [
        { href: "/admin/dashboard", label: "Dashboard" }, { href: "/admin/quizzes", label: "Quizzes" },
        { href: "/admin/question-bank", label: "Question bank" }, { href: "/admin/question-pools", label: "Question pools" },
        { href: "/admin/import", label: "Import / export" }, { href: "/admin/registrations", label: "Registrations" },
        { href: "/admin/attempts", label: "Attempts" }, { href: "/admin/results", label: "Results" },
        { href: "/admin/scholarships", label: "Scholarships" }, { href: "/admin/reports", label: "Reports" },
        { href: "/admin/settings", label: "Settings" },
      ]
    : [{ href: "/admin/attempts", label: "Assigned attempts" }];
  return <AppShell brand="Quiz Admin" items={items} user={`${s.name} · ${s.roles[0]}`}>{children}</AppShell>;
}
