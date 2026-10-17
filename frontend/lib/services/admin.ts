import "server-only";
import { odooCall } from "@/lib/odoo/client";
import type { AdminDashboard, QuizReport, SearchResult } from "@/types";

export const PAGE_SIZE = 20;

export function adminSearch<T = Record<string, unknown>>(
  userId: number, model: string, opts: { domain?: unknown[]; fields: string[]; page?: number; order?: string; limit?: number },
) {
  const limit = opts.limit ?? PAGE_SIZE;
  return odooCall<SearchResult<T>>("admin_search_read", {
    acting_user_id: userId, model, domain: opts.domain ?? [], fields: opts.fields,
    offset: ((opts.page ?? 1) - 1) * limit, limit, order: opts.order,
  });
}

export const adminDashboard = (userId: number) => odooCall<AdminDashboard>("admin_dashboard", { acting_user_id: userId });
export const adminReport = (userId: number, quizId: string) =>
  odooCall<QuizReport>("admin_reports", { acting_user_id: userId, quiz_public_id: quizId });

/** Build an Odoo domain from simple text filters. */
export function textDomain(q: string | undefined, fields: string[]): unknown[] {
  if (!q) return [];
  const terms = fields.map((f) => [f, "ilike", q]);
  return [...Array(Math.max(terms.length - 1, 0)).fill("|"), ...terms];
}

export function pageOf(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
