import Link from "next/link";
import { getStaff, getStudent } from "@/lib/auth/session";

export async function PublicHeader() {
  const [student, staff] = await Promise.all([getStudent(), getStaff()]);
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-bold text-navy">Otomater <span className="text-primary">Quizzes</span></Link>
        <nav className="flex items-center gap-3 text-sm font-medium" aria-label="Public">
          <Link href="/quizzes" className="hidden text-muted hover:text-ink sm:inline">Quizzes</Link>
          {staff && <Link href="/admin/dashboard" className="btn-outline">Admin</Link>}
          {student ? (
            <Link href="/student/dashboard" className="btn-primary">My portal</Link>
          ) : (
            <>
              <Link href="/login" className="text-muted hover:text-ink">Sign in</Link>
              <Link href="/register" className="btn-primary">Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
