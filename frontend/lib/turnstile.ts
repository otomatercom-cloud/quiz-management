import "server-only";
import { OdooError } from "@/lib/odoo/client";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

/** Verifies a Cloudflare Turnstile token server-side. No secret configured = check skipped (local development). */
export async function verifyTurnstile(token: string | undefined, ip: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new OdooError("Please complete the security check.", 400, "user");
  let ok = false;
  try {
    const res = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip && ip !== "local" ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    ok = res.ok && (await res.json()).success === true;
  } catch {
    throw new OdooError("The security check is unavailable. Please try again.", 503, "server");
  }
  if (!ok) throw new OdooError("Security check failed. Please try again.", 400, "user");
}
