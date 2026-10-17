import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, STUDENT_COOKIE, verifySession } from "@/lib/auth/session-core";

// Cheap first gate (signature check). Pages and API routes re-check the role on the server, and Odoo checks again.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.SESSION_SECRET;
  if (pathname.startsWith("/student")) {
    const s = await verifySession(req.cookies.get(STUDENT_COOKIE)?.value, secret);
    if (s?.kind !== "student") return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url));
  }
  if (pathname.startsWith("/admin")) {
    const s = await verifySession(req.cookies.get(STAFF_COOKIE)?.value, secret);
    if (s?.kind !== "staff") return NextResponse.redirect(new URL("/login?staff=1", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/student/:path*", "/admin/:path*"] };
