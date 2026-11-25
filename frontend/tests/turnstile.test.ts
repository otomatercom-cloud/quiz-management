import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { verifyTurnstile } from "@/lib/turnstile";

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

describe("verifyTurnstile", () => {
  afterEach(() => { delete process.env.TURNSTILE_SECRET_KEY; });
  it("is skipped when no secret is set", async () => {
    const f = reply({ success: false });
    await verifyTurnstile(undefined, "1.1.1.1", f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects a missing token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    await expect(verifyTurnstile("", "1.1.1.1", reply({}) as unknown as typeof fetch)).rejects.toThrow(/security check/i);
  });
  it("accepts success and rejects failure", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    await expect(verifyTurnstile("tok", "1.1.1.1", reply({ success: true }) as unknown as typeof fetch)).resolves.toBeUndefined();
    await expect(verifyTurnstile("tok", "1.1.1.1", reply({ success: false }) as unknown as typeof fetch)).rejects.toThrow(/failed/i);
  });
  it("fails closed when Cloudflare is unreachable", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    const boom = vi.fn(async () => { throw new Error("net"); });
    await expect(verifyTurnstile("tok", "local", boom as unknown as typeof fetch)).rejects.toThrow(/unavailable/i);
  });
});
