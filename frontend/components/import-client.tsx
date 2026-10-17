"use client";
import { useState } from "react";
import { Alert } from "@/components/ui";
import { postJson } from "@/components/forms";

type Row = { row: number; status: string; message: string; text: string };
type Result = { state: string; total: number; valid: number; invalid: number; warnings: number; imported: number; rows: Row[]; error_report_csv: string };

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [dups, setDups] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);

  async function run(mode: "validate" | "import") {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("File is larger than 5 MB.");
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await postJson<Result>("/api/admin/import", { filename: file.name, content_b64: btoa(bin), mode, allow_duplicates: dups });
      setRes(r); setImported(mode === "import");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const errs = (res?.rows ?? []).filter((r) => r.status === "invalid");
  const warns = (res?.rows ?? []).filter((r) => r.status === "warning");
  const errorCsv = () => {
    const blob = new Blob(["\ufeff" + (res?.error_report_csv ?? "")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "import-errors.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="btn-outline" href="/api/admin/files/template">Download template</a>
          <a className="btn-outline" href="/api/admin/files/questions">Export questions</a>
        </div>
        <input type="file" accept=".csv,.xlsx" aria-label="Question file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); setImported(false); }} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dups} onChange={(e) => setDups(e.target.checked)} /> Allow duplicate questions</label>
        <div className="flex gap-2">
          <button className="btn-outline" disabled={!file || busy} onClick={() => void run("validate")}>Validate &amp; preview</button>
          <button className="btn-primary" disabled={!file || busy || !res || imported || res.valid === 0} onClick={() => void run("import")}>Import</button>
        </div>
        <p className="text-xs text-muted">Max 5 MB / 2000 rows. Validation runs first; only valid rows are imported; fix the rest via the error report.</p>
      </div>
      {err && <Alert>{err}</Alert>}
      {res && (
        <div className="card space-y-3 p-6 text-sm">
          {imported ? <Alert tone="success">Imported {res.imported} question(s).</Alert>
            : <p>{res.total} row(s) · {res.valid} valid · {res.invalid} with errors · {res.warnings} warning(s)</p>}
          {errs.length > 0 && (<>
            <ul className="max-h-60 overflow-y-auto text-bad">{errs.slice(0, 200).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>
            <button className="btn-outline" onClick={errorCsv}>Download error report</button></>)}
          {warns.length > 0 && <ul className="max-h-40 overflow-y-auto text-warn">{warns.slice(0, 100).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
