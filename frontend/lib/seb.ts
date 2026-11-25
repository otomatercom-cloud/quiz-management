import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Safe Exam Browser sends X-SafeExamBrowser-ConfigKeyHash = SHA256(absolute request URL + Config Key) in lowercase hex.
 * The Config Key never reaches the browser: this runs on the Next.js server only.
 */
export function expectedSebHash(absoluteUrl: string, configKey: string): string {
  return createHash("sha256").update(absoluteUrl + configKey.trim().toLowerCase()).digest("hex");
}

export function sebAllowed(absoluteUrl: string, configKey: string, header: string | null | undefined): boolean {
  if (!header || !/^[0-9a-f]{64}$/i.test(configKey.trim())) return false;
  const a = Buffer.from(expectedSebHash(absoluteUrl, configKey));
  const b = Buffer.from(header.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
