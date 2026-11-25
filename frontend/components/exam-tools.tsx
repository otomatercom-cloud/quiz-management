"use client";
import { useEffect, useMemo, useState } from "react";
import { COLS, ROWS, display, evaluate, type Sheet } from "@/lib/formula";
import { cn } from "@/components/ui";

const KEYS = ["7", "8", "9", "/", "(", "4", "5", "6", "*", ")", "1", "2", "3", "-", "^", "0", ".", "%", "+", "="];

function Calculator() {
  const [expr, setExpr] = useState("");
  const [shown, setShown] = useState("");
  function press(k: string) {
    if (k === "=") {
      const e = expr.replace(/(\d+\.?\d*)%/g, "($1/100)");
      setShown(display(evaluate({ A1: "=" + e }, "A1")));
      return;
    }
    setShown("");
    setExpr((x) => (x + k).slice(0, 80));
  }
  return (
    <div className="space-y-2">
      <input className="input font-mono" aria-label="Calculator expression" value={expr} maxLength={80}
        onChange={(e) => { setExpr(e.target.value.replace(/[^0-9+\-*/^().% ]/g, "")); setShown(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") press("="); }} />
      <div className="min-h-8 rounded-lg bg-slate-100 px-3 py-1 text-right font-mono text-lg" aria-live="polite">{shown}</div>
      <div className="grid grid-cols-5 gap-1">
        {KEYS.map((k) => <button key={k} type="button" className={cn("h-10 rounded-lg border text-sm font-semibold", k === "=" ? "bg-primary text-white" : "bg-white hover:bg-slate-50")} onClick={() => press(k)}>{k}</button>)}
        <button type="button" className="col-span-2 h-10 rounded-lg border bg-white text-sm" onClick={() => { setExpr(""); setShown(""); }}>Clear</button>
        <button type="button" className="col-span-3 h-10 rounded-lg border bg-white text-sm" onClick={() => setExpr((x) => x.slice(0, -1))}>Backspace</button>
      </div>
      <p className="text-xs text-muted">Use ^ for powers, e.g. 2^3. Enter also calculates.</p>
    </div>
  );
}

function Spreadsheet({ storeKey }: { storeKey: string }) {
  const [sheet, setSheet] = useState<Sheet>(() => {
    try { return JSON.parse(sessionStorage.getItem(storeKey) ?? "{}") as Sheet; } catch { return {}; }
  });
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => { try { sessionStorage.setItem(storeKey, JSON.stringify(sheet)); } catch { /* storage unavailable: sheet lives in memory */ } }, [sheet, storeKey]);
  const memo = useMemo(() => new Map(), [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
      <table className="border-collapse text-xs">
        <thead><tr><th className="sticky left-0 top-0 z-10 bg-slate-100 px-1" />{COLS.map((c) => <th key={c} className="sticky top-0 z-[5] min-w-20 bg-slate-100 px-1 py-1">{c}</th>)}</tr></thead>
        <tbody>
          {Array.from({ length: ROWS }, (_, r) => r + 1).map((r) => (
            <tr key={r}>
              <th className="sticky left-0 bg-slate-100 px-1">{r}</th>
              {COLS.map((c) => {
                const ref = c + r;
                const raw = sheet[ref] ?? "";
                return (
                  <td key={ref} className="border border-slate-200 p-0">
                    <input aria-label={`Cell ${ref}`} className="h-7 w-20 bg-white px-1 outline-none focus:ring-1 focus:ring-primary"
                      value={editing === ref ? raw : raw ? display(evaluate(sheet, ref, [], memo)) : ""}
                      onFocus={() => setEditing(ref)} onBlur={() => setEditing(null)} maxLength={80}
                      onChange={(e) => setSheet((s) => ({ ...s, [ref]: e.target.value }))} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Calculator / spreadsheet inside the exam window, so students never need to leave it. Formulas: =SUM(A1:A5), =A1*B1, =IF(...) */
export function ExamTools({ calculator, spreadsheet, attemptId }: { calculator: boolean; spreadsheet: boolean; attemptId: string }) {
  const [open, setOpen] = useState<"calc" | "sheet" | null>(null);
  if (!calculator && !spreadsheet) return null;
  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
      {open && (
        <div className="card w-[min(92vw,34rem)] p-3 shadow-lg" role="dialog" aria-label={open === "calc" ? "Calculator" : "Spreadsheet"}>
          <div className="mb-2 flex items-center justify-between"><strong className="text-sm">{open === "calc" ? "Calculator" : "Spreadsheet"}</strong>
            <button type="button" className="text-sm text-muted" onClick={() => setOpen(null)} aria-label="Close tool">Close</button></div>
          {open === "calc" ? <Calculator /> : <><Spreadsheet storeKey={`otmq-sheet-${attemptId}`} /><p className="mt-1 text-xs text-muted">Type numbers or formulas like =SUM(A1:A5), =A1*B1, =ROUND(A1/3,2). Saved on this device only.</p></>}
        </div>
      )}
      <div className="flex gap-2">
        {calculator && <button type="button" className={cn("btn-outline bg-white", open === "calc" && "ring-2 ring-primary")} onClick={() => setOpen(open === "calc" ? null : "calc")}>Calculator</button>}
        {spreadsheet && <button type="button" className={cn("btn-outline bg-white", open === "sheet" && "ring-2 ring-primary")} onClick={() => setOpen(open === "sheet" ? null : "sheet")}>Spreadsheet</button>}
      </div>
    </div>
  );
}
