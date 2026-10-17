import { NextResponse } from "next/server";
import { z } from "zod";
import { odooCall } from "@/lib/odoo/client";
import { getStaff } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session-core";
import { assertSameOrigin, fail, limit, toResponse } from "@/lib/http";
import { adminCallSchema, adminCreateSchema, adminSearchSchema, adminWriteSchema, ADMIN_MODELS } from "@/lib/validation/schemas";

const importSchema = z.object({
  filename: z.string().max(200).regex(/\.(csv|xlsx)$/i, "Only .csv or .xlsx files"),
  content_b64: z.string().max(7_500_000), // ~5 MB file
  mode: z.enum(["validate", "import"]).default("validate"),
  allow_duplicates: z.boolean().default(false),
});
const deleteSchema = z.object({ model: z.enum(ADMIN_MODELS), ids: z.array(z.number().int().positive()).min(1).max(100) });

// minimum role per action; Odoo enforces the real ACLs again with the acting user's own permissions
const ROLE: Record<string, "evaluator" | "manager" | "admin"> = {
  search: "evaluator", create: "manager", write: "manager", delete: "manager", call: "evaluator", import: "manager",
};

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    assertSameOrigin(req);
    const staff = await getStaff();
    if (!staff) return fail("Please sign in.", 401);
    const need = ROLE[action];
    if (!need) return fail("Not found", 404);
    if (!hasRole(staff.roles, need)) return fail("You are not allowed to do that.", 403);
    limit(req, `admin:${action}`, action === "import" ? 10 : 200, 60_000, String(staff.userId));
    const body = await req.json().catch(() => ({}));
    const acting_user_id = staff.userId;
    let data: unknown;
    switch (action) {
      case "search": data = await odooCall("admin_search_read", { acting_user_id, ...adminSearchSchema.parse(body) }); break;
      case "create": data = await odooCall("admin_create", { acting_user_id, ...adminCreateSchema.parse(body) }); break;
      case "write": data = await odooCall("admin_write", { acting_user_id, ...adminWriteSchema.parse(body) }); break;
      case "delete": data = await odooCall("admin_delete", { acting_user_id, ...deleteSchema.parse(body) }); break;
      case "call": data = await odooCall("admin_call", { acting_user_id, ...adminCallSchema.parse(body) }); break;
      case "import": data = await odooCall("admin_import", { acting_user_id, ...importSchema.parse(body) }, { timeoutMs: 120_000 }); break;
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return toResponse(e);
  }
}
