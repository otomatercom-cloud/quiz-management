const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Kolkata";

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(iso));
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: TZ }).format(new Date(iso));
}

export function fmtPct(n?: number | null): string {
  return n === null || n === undefined ? "—" : `${n.toFixed(2)}%`;
}

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Odoo sends "YYYY-MM-DD HH:MM:SS" (UTC) in search_read; make it a proper ISO string. */
export function odooDate(v?: string | false | null): string | null {
  return v ? `${v.replace(" ", "T")}Z` : null;
}

/** <input type="datetime-local"> (browser local) -> Odoo UTC "YYYY-MM-DD HH:MM:SS" */
export function toOdooDatetime(local: string): string {
  return new Date(local).toISOString().slice(0, 19).replace("T", " ");
}

/** Odoo UTC "YYYY-MM-DD HH:MM:SS" -> value for <input type="datetime-local"> in the browser's timezone. */
export function odooToLocalInput(v?: string | false | null): string {
  if (!v) return "";
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
