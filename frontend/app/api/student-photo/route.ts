import { NextResponse } from "next/server";
import { odooCall } from "@/lib/odoo/client";
import { getStudent } from "@/lib/auth/session";

/** The student's OWN photo only (identity comes from the signed session). Other students never get a photo URL. */
export async function GET() {
  const student = await getStudent();
  if (!student) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const b64 = await odooCall<string | false>("student_photo", { partner_id: student.partnerId });
    if (!b64) return new NextResponse("Not found", { status: 404 });
    const buf = Buffer.from(b64, "base64");
    const type = buf[0] === 0xff ? "image/jpeg" : buf[0] === 0x89 ? "image/png" : "image/webp";
    return new NextResponse(buf, {
      headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }
}
