"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui";

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ ok: false, error: "Unexpected response" }));
  if (!res.ok || json.ok === false) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-bad" role="alert">{error}</p>}
    </div>
  );
}

/** Button that posts to an action endpoint, optionally asking for confirmation first (destructive actions). */
export function ActionButton({ url, body, label, confirm, variant = "outline", onDoneHref }: {
  url: string; body: unknown; label: string; confirm?: string; variant?: "primary" | "outline" | "danger"; onDoneHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await postJson(url, body);
      setAsking(false);
      if (onDoneHref) router.push(onDoneHref);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-outline"}
        disabled={busy} onClick={() => (confirm ? setAsking(true) : run())}>
        {busy ? "Working…" : label}
      </button>
      {error && !asking && <span className="basis-full text-sm text-bad" role="alert">{error}</span>}
      {asking && (
        <ConfirmDialog title={label} text={confirm!} busy={busy} error={error} danger={variant === "danger"}
          onCancel={() => { setAsking(false); setError(null); }} onConfirm={run} />
      )}
    </>
  );
}

export function ConfirmDialog({ title, text, onConfirm, onCancel, busy, error, danger, confirmLabel = "Confirm" }: {
  title: string; text: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; error?: string | null; danger?: boolean; confirmLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="card relative w-full max-w-md p-6">
        <h2 id="dlg-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{text}</p>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
