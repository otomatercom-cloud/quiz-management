"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/components/ui";

type Props = { nickname: string; avatar: string; level: number; xp: number; children: ReactNode };

const DESKTOP = [
  { href: "/student/dashboard", label: "Home" }, { href: "/student/rooms", label: "Rooms" },
  { href: "/student/quizzes", label: "Quizzes" }, { href: "/student/stats", label: "Stats" },
  { href: "/student/results", label: "Results" }, { href: "/student/scholarships", label: "Scholarships" },
];
const BOTTOM = [
  { href: "/student/dashboard", label: "Home", d: "M3 11l9-8 9 8v10h-6v-6H9v6H3z" },
  { href: "/student/rooms", label: "Rooms", d: "M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9 3a3 3 0 1 0 0-6M21 20v-2a4 4 0 0 0-3-3.9" },
  { href: "/student/stats", label: "Stats", d: "M4 20V10m6 10V4m6 16v-7m6 7H2" },
  { href: "/student/profile", label: "Me", d: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0" },
];

export function StudentShell({ nickname, avatar, level, xp, children }: Props) {
  const path = usePathname();
  const router = useRouter();
  const on = (href: string) => path === href || path.startsWith(href + "/");
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.push("/");
    router.refresh();
  }
  return (
    <div className="min-h-screen bg-slate-100 pb-24 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/student/dashboard" className="flex items-center gap-2 text-lg font-extrabold text-primary">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-white" aria-hidden>Q</span>
            <span className="hidden sm:inline">QuizRooms</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {DESKTOP.map((i) => (
              <Link key={i.href} href={i.href} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", on(i.href) ? "bg-primary text-white" : "text-slate-600 hover:bg-primary-light")}>{i.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-bold text-primary">Lv {level} · {xp.toLocaleString()} XP</span>
            <Link href="/student/profile" aria-label="My profile" className="flex items-center gap-2">
              <Avatar kind={avatar} own size={36} />
              <span className="hidden text-sm font-semibold lg:inline">{nickname}</span>
            </Link>
            <button onClick={logout} className="hidden text-sm text-muted underline md:inline">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex rounded-t-3xl border-t border-slate-200 bg-white px-2 pb-3 pt-2 md:hidden" aria-label="Main">
        {BOTTOM.map((i) => (
          <Link key={i.href} href={i.href} className={cn("mx-1 flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold", on(i.href) ? "bg-primary text-white" : "text-slate-600")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={i.d} /></svg>
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
