import "server-only";
import { odooCall } from "@/lib/odoo/client";
import type { AttemptPayload, Paged, QuizCard, Registration, ResultRow, StudentDashboard } from "@/types";

export const publicQuizzes = (search = "", page = 1, limit = 12) =>
  odooCall<Paged<QuizCard>>("public_quizzes", { search, page, limit });
export const publicQuiz = (id: string) => odooCall<QuizCard>("public_quiz", { public_id: id });
export const studentDashboard = (partnerId: number) => odooCall<StudentDashboard>("student_dashboard", { partner_id: partnerId });
export const studentQuizzes = (partnerId: number, search = "", page = 1) =>
  odooCall<Paged<QuizCard>>("student_quizzes", { partner_id: partnerId, search, page, limit: 12 });
export const myRegistrations = (partnerId: number, page = 1) =>
  odooCall<Paged<Registration>>("my_registrations", { partner_id: partnerId, page, limit: 20 });
export const getAttempt = (partnerId: number, id: string) =>
  odooCall<AttemptPayload>("get_attempt", { partner_id: partnerId, attempt_public_id: id });
export const myResults = (partnerId: number, page = 1) =>
  odooCall<Paged<ResultRow>>("my_results", { partner_id: partnerId, page, limit: 20 });
export const resultDetail = (partnerId: number, id: string) =>
  odooCall<ResultRow>("result_detail", { partner_id: partnerId, attempt_public_id: id });
export const myScholarships = (partnerId: number) => odooCall<ResultRow[]>("my_scholarships", { partner_id: partnerId });
export const studentProfile = (partnerId: number) =>
  odooCall<StudentDashboard["student"]>("student_profile", { partner_id: partnerId });
