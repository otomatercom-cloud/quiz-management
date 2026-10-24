import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  STAFF_COOKIE, STUDENT_COOKIE, SESSION_TTL_SECONDS, hasRole, signSession, verifySession,
  type Session, type StaffRole, type StaffSession, type StudentSession,
} from "./session-core";

const secret = () => process.env.SESSION_SECRET;

export async function setSession(session: Session) {
  const token = await signSession(session, secret() ?? "");
  const jar = await cookies();
  jar.set(session.kind === "student" ? STUDENT_COOKIE : STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession(kind: "student" | "staff") {
  (await cookies()).delete(kind === "student" ? STUDENT_COOKIE : STAFF_COOKIE);
}

export async function getStudent(): Promise<StudentSession | null> {
  const s = await verifySession((await cookies()).get(STUDENT_COOKIE)?.value, secret());
  return s?.kind === "student" ? s : null;
}

export async function getStaff(): Promise<StaffSession | null> {
  const s = await verifySession((await cookies()).get(STAFF_COOKIE)?.value, secret());
  return s?.kind === "staff" ? s : null;
}

export async function requireStudent(): Promise<StudentSession> {
  const s = await getStudent();
  if (!s) redirect("/login");
  return s;
}

export async function requireStaff(role: StaffRole = "manager"): Promise<StaffSession> {
  const s = await getStaff();
  if (!s) redirect("/login?staff=1");
  if (!hasRole(s.roles, role)) redirect("/unauthorized");
  return s;
}
