import { ErrorPanel, PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/profile-form";
import { requireStudent } from "@/lib/auth/session";
import { studentProfile } from "@/lib/services/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function Profile() {
  const s = await requireStudent();
  let p;
  try { p = await studentProfile(s.partnerId); } catch (e) { return <ErrorPanel error={e} />; }
  return (
    <>
      <PageHeader title="Profile" subtitle={p.email} />
      <div className="card max-w-xl p-6"><ProfileForm initial={p} /></div>
    </>
  );
}
