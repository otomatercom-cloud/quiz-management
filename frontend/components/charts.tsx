/** Dependency-free bar chart. Renders only the data it is given (never placeholder numbers). */
export function BarChart({ data, unit = "", empty = "No data yet" }: { data: { label: string; value: number }[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length || data.every((d) => d.value === 0)) return <p className="py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Bar chart">
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.value}${unit}`}>
          <span className="text-[10px] text-muted">{d.value || ""}</span>
          <div className="w-full rounded-t bg-primary" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 4 : 0 }} />
          <span className="w-full truncate text-center text-[10px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
