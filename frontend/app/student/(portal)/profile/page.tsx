import Link from "next/link";
import { ErrorPanel } from "@/components/ui";
import { AvatarPicker } from "@/components/avatar-picker";
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
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-extrabold">My profile</h1>
      <AvatarPicker initial={{ nickname: p.nickname, avatar: p.avatar, has_photo: p.has_photo, photo_consent: p.photo_consent }} />
      <section className="card space-y-4 p-5">
        <div><h2 className="font-bold">Details</h2><p className="text-sm text-muted">{p.email}</p></div>
        <ProfileForm initial={p} />
      </section>
      <section className="card grid grid-cols-2 gap-2 p-4 text-sm font-semibold text-primary">
        <Link href="/student/quizzes" className="rounded-xl bg-primary-light p-3 text-center">All quizzes</Link>
        <Link href="/student/registrations" className="rounded-xl bg-primary-light p-3 text-center">My registrations</Link>
        <Link href="/student/results" className="rounded-xl bg-primary-light p-3 text-center">Results</Link>
        <Link href="/student/scholarships" className="rounded-xl bg-primary-light p-3 text-center">Scholarships</Link>
      </section>
    </div>
  );
}
