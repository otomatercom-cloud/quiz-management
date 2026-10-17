import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-primary-light px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 block text-center text-xl font-bold text-navy">Otomater <span className="text-primary">Quizzes</span></Link>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>}
          <div className={subtitle ? "" : "mt-6"}>{children}</div>
        </div>
      </div>
    </main>
  );
}
