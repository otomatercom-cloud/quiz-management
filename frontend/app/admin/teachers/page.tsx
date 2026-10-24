import { ErrorPanel, PageHeader } from "@/components/ui";
import { TeachersClient, type Teacher } from "@/components/teachers-client";
import { requireStaff } from "@/lib/auth/session";
import { odooCall } from "@/lib/odoo/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teachers" };

export default async function Teachers() {
  const s = await requireStaff("admin");
  try {
    const t = await odooCall<Teacher[]>("admin_teachers", { acting_user_id: s.userId });
    return (<><PageHeader title="Teachers" subtitle="Question authors. Questions they add are visible only to them and to managers." /><TeachersClient teachers={t} /></>);
  } catch (e) { return <ErrorPanel error={e} />; }
}
