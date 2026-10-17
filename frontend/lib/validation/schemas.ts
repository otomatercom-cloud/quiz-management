import { z } from "zod";

const publicId = z.string().regex(/^[0-9a-f]{16}$/, "Invalid identifier");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  phone: z.string().trim().regex(/^\+?[0-9 \-]{7,18}$/, "Enter a valid mobile number"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  student_code: z.string().trim().max(40).optional().default(""),
  education: z.string().trim().max(120).optional().default(""),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your email").max(160),
  password: z.string().min(1, "Enter your password").max(128),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[0-9 \-]{7,18}$/, "Enter a valid mobile number"),
  student_code: z.string().trim().max(40).optional().default(""),
  education: z.string().trim().max(120).optional().default(""),
});

export const answerSchema = z.object({
  attempt_public_id: publicId,
  seq: z.number().int().min(1).max(500),
  option_ids: z.array(z.number().int().positive()).max(1).optional(),
  text: z.string().max(5000).optional(),
  marked: z.boolean().optional(),
});

export const attemptRef = z.object({ attempt_public_id: publicId });
export const quizRef = z.object({ quiz_public_id: publicId });
export const registrationRef = z.object({ registration_public_id: publicId });

export const ADMIN_MODELS = [
  "otm.quiz", "otm.quiz.question", "otm.quiz.question.option", "otm.quiz.question.pool", "otm.quiz.scholarship.rule",
  "otm.quiz.registration", "otm.quiz.tag", "otm.quiz.attempt", "otm.quiz.attempt.answer", "otm.quiz.audit.log",
] as const;
export const WRITABLE_MODELS = [
  "otm.quiz", "otm.quiz.question", "otm.quiz.question.pool", "otm.quiz.scholarship.rule", "otm.quiz.tag",
] as const;

export const adminSearchSchema = z.object({
  model: z.enum(ADMIN_MODELS),
  domain: z.array(z.any()).max(20).default([]),
  fields: z.array(z.string().regex(/^[a-z_0-9.]+$/)).max(40).default(["id"]),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(20),
  order: z.string().regex(/^[a-z_0-9, ]+( (asc|desc))?$/i).optional(),
});

export const adminCreateSchema = z.object({ model: z.enum(WRITABLE_MODELS), vals: z.record(z.any()) });
export const adminWriteSchema = z.object({
  model: z.enum(WRITABLE_MODELS), ids: z.array(z.number().int().positive()).min(1).max(500), vals: z.record(z.any()),
});
export const adminCallSchema = z.object({
  model: z.enum(ADMIN_MODELS), ids: z.array(z.number().int().positive()).min(1).max(500),
  method: z.string().regex(/^[a-z][a-z_]*$/), args: z.array(z.any()).max(5).default([]), kwargs: z.record(z.any()).default({}),
});

// ----- quiz wizard (client-side step validation, server re-validates on publish)
export const quizBasicsSchema = z.object({
  name: z.string().trim().min(3, "Give the quiz a title").max(160),
  subject: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(1000).optional().default(""),
  instructions: z.string().trim().max(4000).optional().default(""),
});

export const quizSettingsSchema = z
  .object({
    quiz_start: z.string().min(1, "Start date required"),
    quiz_end: z.string().min(1, "End date required"),
    duration_minutes: z.coerce.number().int().min(1).max(600),
    passing_percentage: z.coerce.number().min(0).max(100),
    maximum_attempts: z.coerce.number().int().min(1).max(20),
    negative_marking_enabled: z.boolean().default(false),
    default_negative_marks: z.coerce.number().min(0).max(100).default(0),
    randomize_questions: z.boolean().default(true),
    randomize_options: z.boolean().default(true),
    show_results_immediately: z.boolean().default(true),
    show_correct_answers_after_submission: z.boolean().default(false),
    registration_required: z.boolean().default(true),
    registration_start: z.string().optional().default(""),
    registration_end: z.string().optional().default(""),
    registration_limit: z.coerce.number().int().min(0).default(0),
  })
  .refine((v) => new Date(v.quiz_end) > new Date(v.quiz_start), { message: "End must be after start", path: ["quiz_end"] })
  .refine((v) => !v.registration_required || (v.registration_start && v.registration_end), {
    message: "Registration dates are required", path: ["registration_end"],
  });

export const scholarshipRuleSchema = z.object({
  name: z.string().trim().min(1),
  minimum_percentage: z.coerce.number().min(0).max(100),
  maximum_percentage: z.coerce.number().min(0).max(100).default(0),
  scholarship_type: z.enum(["percentage", "fixed_amount"]),
  scholarship_value: z.coerce.number().positive(),
  sequence: z.coerce.number().int().default(10),
});
