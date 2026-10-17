import { odooCall } from "@/lib/odoo/client";
import { getStaff } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session-core";
import { fail, toResponse } from "@/lib/http";

type CsvFile = { filename: string; csv: string };

export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  try {
    const staff = await getStaff();
    if (!staff) return fail("Please sign in.", 401);
    let file: CsvFile;
    if (kind === "template") {
      file = await odooCall<CsvFile>("admin_import_template", { acting_user_id: staff.userId });
    } else if (kind === "questions" || kind === "answer-key") {
      const withAnswers = kind === "answer-key";
      if (withAnswers && !hasRole(staff.roles, "admin")) return fail("Only administrators can export the answer key.", 403);
      file = await odooCall<CsvFile>("admin_export_questions", { acting_user_id: staff.userId, include_answers: withAnswers });
    } else {
      return fail("Not found", 404);
    }
    return new Response("﻿" + file.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return toResponse(e);
  }
}
