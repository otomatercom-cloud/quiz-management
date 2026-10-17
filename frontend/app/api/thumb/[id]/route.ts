import { odooCall } from "@/lib/odoo/client";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{16}$/.test(id)) return new Response("Not found", { status: 404 });
  try {
    const b64 = await odooCall<string | false>("quiz_thumbnail", { public_id: id });
    if (!b64) return new Response("Not found", { status: 404 });
    const buf = Buffer.from(b64, "base64");
    const type = buf[0] === 0x89 ? "image/png" : buf[0] === 0xff ? "image/jpeg" : "image/webp";
    return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
