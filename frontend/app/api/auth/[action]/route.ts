import { NextResponse } from "next/server";
import { z } from "zod";
import { odooCall } from "@/lib/odoo/client";
import { clearSession, getStudent, setSession } from "@/lib/auth/session";
import { assertSameOrigin, fail, limit, toResponse } from "@/lib/http";
import { clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { guestSchema, loginSchema, otpRequestSchema, registerSchema } from "@/lib/validation/schemas";

type StudentPayload = { partner_id: number; name: string };
type GuestPayload = StudentPayload & { attempt_id: string };
type OtpReply = { otp_error?: string };
type StaffPayload = { user_id: number; name: string; roles: string[] };

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    assertSameOrigin(req);
    const body = await req.json().catch(() => ({}));

    if (action === "register") {
      limit(req, "register", 5, 10 * 60_000);
      const { turnstile, ...v } = registerSchema.parse(body);
      await verifyTurnstile(turnstile, clientIp(req.headers));
      const s = await odooCall<StudentPayload & OtpReply>("student_register", v);
      if (s.otp_error) return fail(s.otp_error, 422);
      await setSession({ kind: "student", partnerId: s.partner_id, name: s.name });
      return NextResponse.json({ ok: true });
    }
    if (action === "otp") {
      // per IP (anti-spray) and per email (anti-bombing); Odoo adds a 60 s cooldown and 5 codes/hour on top
      limit(req, "otp-ip", 10, 10 * 60_000);
      const { turnstile, ...v } = otpRequestSchema.parse(body);
      limit(req, "otp-email", 3, 10 * 60_000, v.email);
      await verifyTurnstile(turnstile, clientIp(req.headers));
      await odooCall("student_request_otp", { email: v.email, purpose: v.purpose });
      return NextResponse.json({ ok: true });
    }
    if (action === "guest") {
      limit(req, "guest", 10, 10 * 60_000);
      const { turnstile, ...v } = guestSchema.parse(body);
      limit(req, "guest-phone", 5, 60 * 60_000, v.phone.replace(/\D/g, "").slice(-10));
      await verifyTurnstile(turnstile, clientIp(req.headers));
      const existing = await getStudent();
      if (existing && !existing.guest) return fail("You are signed in. Start the quiz from your account.", 409);
      const g = await odooCall<GuestPayload & OtpReply>("guest_start", v);
      if (g.otp_error) return fail(g.otp_error, 422);
      await setSession({ kind: "student", partnerId: g.partner_id, name: g.name, guest: true });
      return NextResponse.json({ ok: true, data: { attempt_id: g.attempt_id } });
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
      const v = z.object({ email: z.string().email().max(254), turnstile: z.string().max(4096).optional() }).parse(body);
      await verifyTurnstile(v.turnstile, clientIp(req.headers));
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
