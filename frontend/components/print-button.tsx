"use client";

export function PrintButton() {
  return <button className="btn-outline print:hidden" onClick={() => window.print()}>Print summary</button>;
}
