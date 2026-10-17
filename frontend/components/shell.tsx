"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

type NavItem = { href: string; label: string };

export function AppShell({ brand, items, user, children }: { brand: string; items: NavItem[]; user: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.push("/");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
      {items.map((i) => {
        const active = path === i.href || (i.href.split("/").length > 2 && path.startsWith(i.href));
        return (
          <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
            className={cn("rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-primary text-white" : "text-blue-100 hover:bg-white/10")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );

  const side = (
    <div className="flex h-full flex-col bg-navy py-5 text-white">
      <Link href="/" className="mb-6 px-6 text-lg font-bold">{brand}</Link>
      {nav}
      <div className="mt-4 border-t border-white/10 px-6 pt-4 text-sm">
        <p className="truncate text-blue-100">{user}</p>
        <button onClick={logout} className="mt-2 text-blue-200 underline hover:text-white">Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 lg:block"><div className="fixed inset-y-0 w-64">{side}</div></aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="font-bold text-navy">{brand}</span>
        <button className="btn-outline" aria-expanded={open} aria-label="Toggle menu" onClick={() => setOpen(!open)}>Menu</button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{side}</div>
        </div>
      )}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
