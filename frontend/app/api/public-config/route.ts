import { NextResponse } from "next/server";
import { odooCall } from "@/lib/odoo/client";

export const dynamic = "force-dynamic";

/** What the public forms need to know: is an email code required, and the (public) Turnstile site key. */
export async function GET() {
  let requireOtp = false;
  try { requireOtp = !!(await odooCall<{ require_email_otp: boolean }>("public_config", {})).require_email_otp; } catch { /* default off */ }
  return NextResponse.json({ ok: true, data: { require_email_otp: requireOtp, turnstile_site_key: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "" } });
}
