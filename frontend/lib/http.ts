import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OdooError } from "@/lib/odoo/client";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function toResponse(e: unknown) {
  if (e instanceof ZodError) return fail(e.issues[0]?.message ?? "Invalid input", 422);
  if (e instanceof OdooError) return fail(e.message, e.status);
  console.error("[api] unexpected error", (e as Error)?.message);
  return fail("Something went wrong. Please try again.", 500);
}

/** CSRF defence for cookie-authenticated JSON endpoints: JSON content-type + same-origin check. */
export function assertSameOrigin(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new OdooError("Unsupported request", 415, "user");
  const origin = req.headers.get("origin");
  if (origin) {
    const allowed = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : new URL(req.url).host;
    if (new URL(origin).host !== allowed && new URL(origin).host !== req.headers.get("host")) throw new OdooError("Forbidden", 403, "forbidden");
  }
}

export function limit(req: Request, bucket: string, max: number, windowMs: number, who = "") {
  const r = rateLimit(`${bucket}:${who || clientIp(req.headers)}`, max, windowMs);
  if (!r.ok) throw new OdooError(`Too many requests. Try again in ${r.retryAfter}s.`, 429, "user");
}
