import "server-only";

/**
 * Server-only Odoo 19 client. Uses the supported JSON-2 external API:
 *   POST {ODOO_BASE_URL}/json/2/otm.quiz.api/<method>
 *   Authorization: bearer <API key of the service user>, X-Odoo-Database: <db>
 * Secrets never reach the browser (no NEXT_PUBLIC_ prefix, module is server-only).
 */

export class OdooError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: "user" | "denied" | "forbidden" | "network" | "server",
  ) {
    super(message);
  }
}

// Read-only methods are safe to retry once on a transient failure. Everything else is never auto-retried.
const RETRYABLE = new Set([
  "public_quizzes", "public_quiz", "quiz_thumbnail", "student_profile", "student_quizzes", "my_registrations",
  "get_attempt", "my_results", "result_detail", "my_scholarships", "student_dashboard", "admin_search_read",
  "admin_dashboard", "admin_reports", "admin_import_template", "admin_export_questions",
]);

function config() {
  const base = process.env.ODOO_BASE_URL?.replace(/\/+$/, "");
  const db = process.env.ODOO_DATABASE;
  const key = process.env.ODOO_API_KEY;
  if (!base || !db || !key) throw new OdooError("Server is not configured.", 500, "server");
  return { base, db, key };
}

export function mapOdooFailure(status: number, body: { name?: string; message?: string } | null): OdooError {
  const name = body?.name ?? "";
  const msg = body?.message ?? "";
  if (name.endsWith("AccessDenied")) return new OdooError(msg || "Invalid credentials.", 401, "denied");
  if (name.endsWith("AccessError")) return new OdooError("You are not allowed to do that.", 403, "forbidden");
  if (name.endsWith("UserError") || name.endsWith("ValidationError")) return new OdooError(msg || "Request rejected.", 400, "user");
  return new OdooError("The service is temporarily unavailable. Please try again.", status >= 500 ? 502 : 500, "server");
}

export async function odooCall<T>(
  method: string,
  params: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const { base, db, key } = config();
  const attempts = RETRYABLE.has(method) ? 2 : 1;
  let last: OdooError | null = null;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
    try {
      const res = await fetch(`${base}/json/2/otm.quiz.api/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `bearer ${key}`, "X-Odoo-Database": db },
        body: JSON.stringify(params),
        signal: ctrl.signal,
        cache: "no-store",
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON body */
      }
      if (res.ok) return json as T;
      last = mapOdooFailure(res.status, json as { name?: string; message?: string } | null);
      if (res.status < 500) break; // client errors are final
    } catch (e) {
      last = new OdooError(
        (e as Error).name === "AbortError" ? "The service timed out. Please try again." : "Cannot reach the service.",
        504,
        "network",
      );
    } finally {
      clearTimeout(timer);
    }
    console.error(`[odoo] ${method} failed (attempt ${i + 1}): ${last?.kind}`); // never log params
  }
  throw last ?? new OdooError("Unknown error", 500, "server");
}
