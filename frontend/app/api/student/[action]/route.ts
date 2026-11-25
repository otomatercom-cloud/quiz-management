import { NextResponse } from "next/server";
import { z } from "zod";
import { odooCall } from "@/lib/odoo/client";
import { getStudent } from "@/lib/auth/session";
import { assertSameOrigin, fail, limit, toResponse } from "@/lib/http";
import { answerSchema, attemptRef, avatarSchema, profileSchema, quizRef, registrationRef, roomRef } from "@/lib/validation/schemas";

/**
 * Whitelisted student actions. The student's identity ALWAYS comes from the signed session cookie — a partner id sent
 * by the browser is ignored. Odoo re-validates ownership, timing and attempt state on every call.
 */
const ACTIONS: Record<string, { method: string; schema: z.ZodTypeAny; max: number; windowMs: number }> = {
  register_quiz: { method: "register_quiz", schema: quizRef, max: 20, windowMs: 60_000 },
  cancel_registration: { method: "cancel_registration", schema: registrationRef, max: 20, windowMs: 60_000 },
  start_attempt: { method: "start_attempt", schema: quizRef, max: 15, windowMs: 60_000 },
  save_answer: { method: "save_answer", schema: answerSchema, max: 240, windowMs: 60_000 },
  submit_attempt: { method: "submit_attempt", schema: attemptRef, max: 20, windowMs: 60_000 },
  set_avatar: { method: "student_set_avatar", schema: avatarSchema, max: 10, windowMs: 60_000 },
  join_room: { method: "student_join_room", schema: roomRef, max: 20, windowMs: 60_000 },
  leave_room: { method: "student_leave_room", schema: roomRef, max: 20, windowMs: 60_000 },
  update_profile: { method: "student_update_profile", schema: profileSchema, max: 10, windowMs: 60_000 },
};

const GUEST_ACTIONS = new Set(["start_attempt", "save_answer", "submit_attempt"]);

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    assertSameOrigin(req);
    const student = await getStudent();
    if (!student) return fail("Please sign in.", 401);
    const def = ACTIONS[action];
    if (!def) return fail("Not found", 404);
    if (student.guest && !GUEST_ACTIONS.has(action)) return fail("Please create a free account to use this feature.", 403);
    limit(req, `student:${action}`, def.max, def.windowMs, String(student.partnerId));
    const input = def.schema.parse(await req.json().catch(() => ({})));
    const data = await odooCall<unknown>(def.method, { ...input, partner_id: student.partnerId });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return toResponse(e);
  }
}
