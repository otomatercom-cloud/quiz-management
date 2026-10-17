import Link from "next/link";
import type { ReactNode } from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const TONES: Record<string, string> = {
  pass: "bg-green-50 text-ok", published: "bg-green-50 text-ok", evaluated: "bg-green-50 text-ok",
  confirmed: "bg-green-50 text-ok", approved: "bg-green-50 text-ok", eligible: "bg-primary-light text-primary",
  registered: "bg-primary-light text-primary", in_progress: "bg-primary-light text-primary",
  submitted: "bg-amber-50 text-warn", pending: "bg-amber-50 text-warn", expired: "bg-amber-50 text-warn",
  draft: "bg-slate-100 text-muted", closed: "bg-slate-100 text-muted", archived: "bg-slate-100 text-muted",
  not_applicable: "bg-slate-100 text-muted", not_eligible: "bg-slate-100 text-muted", not_started: "bg-slate-100 text-muted",
  fail: "bg-red-50 text-bad", cancelled: "bg-red-50 text-bad", rejected: "bg-red-50 text-bad", disqualified: "bg-red-50 text-bad",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", TONES[value] ?? "bg-slate-100 text-muted")}>
      {label ?? value.replaceAll("_", " ")}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-xl text-primary" aria-hidden>○</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const t = {
    error: "border-red-200 bg-red-50 text-bad", success: "border-green-200 bg-green-50 text-ok",
    info: "border-blue-200 bg-primary-light text-navy", warning: "border-amber-200 bg-amber-50 text-warn",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", t)}>{children}</div>;
}

export function ErrorPanel({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return <Alert>{msg}</Alert>;
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "outline" }) {
  return <Link href={href} className={variant === "primary" ? "btn-primary" : "btn-outline"}>{children}</Link>;
}

export function DataTable({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50"><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
      {empty && <p className="px-4 py-10 text-center text-sm text-muted">Nothing to show yet.</p>}
    </div>
  );
}

export function Pagination({ total, page, pageSize, base, params = {} }: {
  total: number; page: number; pageSize: number; base: string; params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${base}?${q}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-muted">Page {page} of {pages} · {total} records</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-outline" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn-outline" href={href(page + 1)}>Next</Link>}
      </div>
    </nav>
  );
}

export function SearchBar({ action, q, placeholder = "Search…", children }: { action: string; q?: string; placeholder?: string; children?: ReactNode }) {
  return (
    <form action={action} className="mb-4 flex flex-wrap gap-2">
      <input name="q" defaultValue={q} placeholder={placeholder} aria-label="Search" className="input max-w-xs" />
      {children}
      <button className="btn-outline" type="submit">Search</button>
    </form>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}
    </div>
  );
}
