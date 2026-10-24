import { describe, expect, it } from "vitest";
import { clockOffsetMs, formatClock, remainingMs } from "@/lib/timer";
import { enqueue, selectOption, statusOf, summarize, type Question } from "@/lib/quiz-state";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { hasRole, signSession, verifySession } from "@/lib/auth/session-core";
import { adminCallSchema, adminSearchSchema, quizSettingsSchema, scholarshipRuleSchema } from "@/lib/validation/schemas";
import { x2many, buildQuizVals } from "@/components/quiz-wizard";
import { odooToLocalInput, toOdooDatetime } from "@/lib/format";

const q = (o: Partial<Question> = {}): Question => ({ seq: 1, type: "mcq", text: "t", marks: 1, options: [{ id: 1, text: "a" }, { id: 2, text: "b" }], selected: [], text_answer: "", marked: false, ...o });

describe("timer", () => {
  it("uses server clock offset, not the device clock", () => {
    const offset = clockOffsetMs("2026-01-01T10:00:00Z", Date.parse("2026-01-01T09:00:00Z")); // device 1h behind
    expect(remainingMs("2026-01-01T10:30:00Z", offset, Date.parse("2026-01-01T09:00:00Z"))).toBe(30 * 60_000);
  });
  it("never goes negative and formats", () => {
    expect(remainingMs("2026-01-01T10:00:00Z", 0, Date.parse("2026-01-01T11:00:00Z"))).toBe(0);
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});

describe("quiz state", () => {
  it("status and summary", () => {
    expect(statusOf(q())).toBe("unanswered");
    expect(statusOf(q({ selected: [1] }))).toBe("answered");
    expect(statusOf(q({ selected: [1], marked: true }))).toBe("review");
    const s = summarize([q(), q({ seq: 2, selected: [2] }), q({ seq: 3, marked: true })]);
    expect(s).toEqual({ total: 3, answered: 1, unanswered: 2, marked: 1 });
  });
  it("selecting the same option clears it", () => {
    const a = selectOption([q()], 1, 2);
    expect(a[0].selected).toEqual([2]);
    expect(selectOption(a, 1, 2)[0].selected).toEqual([]);
  });
  it("save queue keeps only the latest per question and merges fields", () => {
    let queue = enqueue([], { seq: 1, option_ids: [1] });
    queue = enqueue(queue, { seq: 2, text: "x" });
    queue = enqueue(queue, { seq: 1, option_ids: [2] });
    queue = enqueue(queue, { seq: 1, marked: true });
    expect(queue).toEqual([{ seq: 1, option_ids: [2], marked: true }, { seq: 2, text: "x" }]);
  });
});

describe("rate limit", () => {
  it("blocks after the limit and recovers after the window", () => {
    resetRateLimits();
    expect(rateLimit("k", 2, 1000, 0).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, 1).ok).toBe(true);
    const r = rateLimit("k", 2, 1000, 2);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(rateLimit("k", 2, 1000, 1500).ok).toBe(true);
  });
});

describe("session", () => {
  const secret = "x".repeat(40);
  it("round-trips and rejects tampering / wrong secret / missing", async () => {
    const t = await signSession({ kind: "student", partnerId: 7, name: "A" }, secret);
    expect(await verifySession(t, secret)).toMatchObject({ kind: "student", partnerId: 7 });
    expect(await verifySession(t + "x", secret)).toBeNull();
    expect(await verifySession(t, "y".repeat(40))).toBeNull();
    expect(await verifySession(undefined, secret)).toBeNull();
  });
  it("teacher role is its own branch", () => {
    expect(hasRole(["teacher"], "teacher")).toBe(true);
    expect(hasRole(["teacher"], "manager")).toBe(false);
    expect(hasRole(["teacher"], "evaluator")).toBe(false);
    expect(hasRole(["teacher"], "staff")).toBe(true);
    expect(hasRole(["manager"], "teacher")).toBe(true);
    expect(hasRole(["admin"], "teacher")).toBe(true);
    expect(hasRole(["evaluator"], "teacher")).toBe(false);
  });
  it("role hierarchy", () => {
    expect(hasRole(["admin"], "manager")).toBe(true);
    expect(hasRole(["evaluator"], "manager")).toBe(false);
    expect(hasRole([], "evaluator")).toBe(false);
  });
});

describe("schemas", () => {
  it("rejects end before start and missing registration dates", () => {
    const base = { quiz_start: "2026-01-02T10:00", quiz_end: "2026-01-01T10:00", duration_minutes: 30, passing_percentage: 40, maximum_attempts: 1, registration_required: false };
    expect(quizSettingsSchema.safeParse(base).success).toBe(false);
    const ok = { ...base, quiz_end: "2026-01-03T10:00" };
    expect(quizSettingsSchema.safeParse(ok).success).toBe(true);
    expect(quizSettingsSchema.safeParse({ ...ok, registration_required: true }).success).toBe(false);
  });
  it("admin schemas whitelist models, fields and methods", () => {
    expect(adminSearchSchema.safeParse({ model: "res.users" }).success).toBe(false);
    expect(adminSearchSchema.safeParse({ model: "otm.quiz", fields: ["name; drop"] }).success).toBe(false);
    expect(adminSearchSchema.safeParse({ model: "otm.quiz", order: "id desc" }).success).toBe(true);
    expect(adminCallSchema.safeParse({ model: "otm.quiz", ids: [1], method: "__import__" }).success).toBe(false);
    expect(scholarshipRuleSchema.safeParse({ name: "x", minimum_percentage: 70, scholarship_type: "percentage", scholarship_value: 0 }).success).toBe(false);
  });
});

describe("date helpers", () => {
  it("round-trips local input <-> Odoo UTC", () => {
    const local = "2026-03-05T14:30";
    expect(odooToLocalInput(toOdooDatetime(local))).toBe(local);
  });
});

describe("quiz edit helpers", () => {
  it("x2many: removes deleted, creates new, leaves existing untouched", () => {
    const cmds = x2many([{ id: 1, name: "keep" }, { name: "new" }] as { id?: number; name: string }[], [1, 2]);
    expect(cmds).toEqual([[2, 2, 0], [0, 0, { name: "new" }]]);
  });
  it("buildQuizVals is stable so unchanged fields can be diffed away", () => {
    const v = { name: "Q", quiz_start: "2026-03-05T10:00", quiz_end: "2026-03-06T10:00", duration_minutes: "30", passing_percentage: "40", maximum_attempts: "1", access: "open", instructions: "a\n\nb" };
    expect(JSON.stringify(buildQuizVals(v))).toBe(JSON.stringify(buildQuizVals({ ...v })));
    expect(buildQuizVals(v).registration_required).toBe(false);
    expect(buildQuizVals({ ...v, access: "approval" }).approval_required).toBe(true);
  });
});
