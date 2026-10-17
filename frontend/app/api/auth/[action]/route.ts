import { NextResponse } from "next/server";
import { z } from "zod";
import { odooCall } from "@/lib/odoo/client";
import { clearSession, setSession } from "@/lib/auth/session";
import { assertSameOrigin, fail, limit, toResponse } from "@/lib/http";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";

type StudentPayload = { partner_id: number; name: string };
type StaffPayload = { user_id: number; name: string; roles: string[] };

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    assertSameOrigin(req);
    const body = await req.json().catch(() => ({}));

    if (action === "register") {
      limit(req, "register", 5, 10 * 60_000);
      const v = registerSchema.parse(body);
      const s = await odooCall<StudentPayload>("student_register", v);
      await setSession({ kind: "student", partnerId: s.partner_id, name: s.name });
      return NextResponse.json({ ok: true });
    }
    if (action === "login") {
      limit(req, "login", 10, 10 * 60_000);
      const v = loginSchema.parse(body);
      const s = await odooCall<StudentPayload>("student_login", v);
      await setSession({ kind: "student", partnerId: s.partner_id, name: s.name });
      return NextResponse.json({ ok: true });
    }
    if (action === "staff-login") {
      limit(req, "staff-login", 8, 10 * 60_000);
      const v = loginSchema.parse(body);
      const s = await odooCall<StaffPayload>("admin_login", v);
      await setSession({ kind: "staff", userId: s.user_id, name: s.name, roles: s.roles });
      return NextResponse.json({ ok: true });
    }
    if (action === "forgot") {
      limit(req, "forgot", 5, 10 * 60_000);
      const v = z.object({ email: z.string().email().max(254) }).parse(body);
      await odooCall("student_forgot_password", { email: v.email }).catch(() => undefined); // never reveal whether the account exists
      return NextResponse.json({ ok: true });
    }
    if (action === "logout") {
      await clearSession("student");
      await clearSession("staff");
      return NextResponse.json({ ok: true });
    }
    return fail("Not found", 404);
  } catch (e) {
    return toResponse(e);
  }
}
