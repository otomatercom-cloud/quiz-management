/**
 * Small in-memory sliding-window limiter. Good for a single Node process; behind several instances use a shared
 * store (Redis) or enforce limits at the reverse proxy as well.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  const fresh = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    hits.set(key, fresh);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - fresh[0])) / 1000) };
  }
  fresh.push(now);
  hits.set(key, fresh);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true, retryAfter: 0 };
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export function resetRateLimits() {
  hits.clear();
}
