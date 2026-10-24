import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session-core";

export default async function AdminHome() {
  const s = await requireStaff("staff");
  redirect(hasRole(s.roles, "manager") ? "/admin/dashboard" : hasRole(s.roles, "teacher") ? "/admin/question-bank" : "/admin/attempts");
}
