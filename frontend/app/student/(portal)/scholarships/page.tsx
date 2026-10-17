import Link from "next/link";
import { Alert, Badge, EmptyState, ErrorPanel, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/session";
import { fmtPct } from "@/lib/format";
import { myScholarships } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scholarships" };

export default async function Scholarships() {
  const s = await requireStudent();
  let items;
  try { items = await myScholarships(s.partnerId); } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Scholarships" subtitle="Eligibility is based on your quiz score. An award is only final once approved by the institute." />
      {!items.length ? <EmptyState title="No scholarship eligibility yet" text="Reach a scholarship band in a quiz to see it here." /> : (
        <div className="space-y-4">
          {items.map((r) => (
            <article key={r.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/student/results/${r.id}`} className="font-semibold text-primary">{r.quiz_title}</Link>
                <Badge value={r.scholarship_status ?? "pending"} />
              </div>
              <p className="mt-2 text-sm">Score {fmtPct(r.percentage)} → {r.scholarship_type === "percentage" ? `${r.scholarship_value}% fee waiver` : `₹${r.scholarship_value}`}{r.scholarship_amount ? ` (≈ ₹${r.scholarship_amount})` : ""}</p>
              {r.scholarship_status === "eligible" && <div className="mt-3"><Alert tone="info">Eligible — awaiting confirmation from the institute.</Alert></div>}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
