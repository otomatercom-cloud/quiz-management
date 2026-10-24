import { SignJWT, jwtVerify } from "jose";

export type StudentSession = { kind: "student"; partnerId: number; name: string };
export type StaffSession = { kind: "staff"; userId: number; name: string; roles: string[] };
export type Session = StudentSession | StaffSession;

export const STUDENT_COOKIE = "otmq_student";
export const STAFF_COOKIE = "otmq_staff";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(session: Session, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string | undefined): Promise<Session | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (payload.kind === "student" && typeof payload.partnerId === "number")
      return { kind: "student", partnerId: payload.partnerId, name: String(payload.name ?? "") };
    if (payload.kind === "staff" && typeof payload.userId === "number" && Array.isArray(payload.roles))
      return { kind: "staff", userId: payload.userId, name: String(payload.name ?? ""), roles: payload.roles.map(String) };
  } catch {
    /* expired or tampered */
  }
  return null;
}

export type StaffRole = "admin" | "manager" | "evaluator" | "teacher" | "staff";

/**
 * admin > manager > evaluator. "teacher" (question author) is a separate branch: managers and admins can do
 * everything a teacher can, evaluators cannot. "staff" means any quiz role. Odoo enforces the real ACLs again.
 */
export function hasRole(roles: string[], needed: StaffRole): boolean {
  if (needed === "staff") return roles.some((r) => ["admin", "manager", "evaluator", "teacher"].includes(r));
  if (needed === "teacher") return roles.some((r) => ["admin", "manager", "teacher"].includes(r));
  const rank = { evaluator: 1, manager: 2, admin: 3 } as const;
  return roles.some((r) => (rank[r as keyof typeof rank] ?? 0) >= rank[needed]);
}
