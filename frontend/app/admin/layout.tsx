import { AppShell } from "@/components/shell";
import { requireStaff } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session-core";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff("staff");
  const manager = hasRole(s.roles, "manager");
  const teacher = hasRole(s.roles, "teacher");
  const items = manager
    ? [
        { href: "/admin/dashboard", label: "Dashboard" }, { href: "/admin/quizzes", label: "Quizzes" },
        { href: "/admin/question-bank", label: "Question bank" }, { href: "/admin/question-pools", label: "Question pools" },
        { href: "/admin/import", label: "Import / export" }, { href: "/admin/registrations", label: "Registrations" },
        { href: "/admin/attempts", label: "Attempts" }, { href: "/admin/results", label: "Results" },
        { href: "/admin/scholarships", label: "Scholarships" }, { href: "/admin/reports", label: "Reports" },
        ...(hasRole(s.roles, "admin") ? [{ href: "/admin/teachers", label: "Teachers" }, { href: "/admin/audit", label: "Audit log" }] : []),
        { href: "/admin/settings", label: "Settings" },
      ]
    : [
        ...(teacher ? [{ href: "/admin/question-bank", label: "My questions" }, { href: "/admin/questions/new", label: "Add question" }, { href: "/admin/import", label: "Import questions" }] : []),
        ...(hasRole(s.roles, "evaluator") ? [{ href: "/admin/attempts", label: "Assigned attempts" }] : []),
      ];
  return <AppShell brand="Quiz Admin" items={items} user={`${s.name} · ${s.roles[0]}`}>{children}</AppShell>;
}
