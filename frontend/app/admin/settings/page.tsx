import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";

export const metadata = { title: "Settings" };
export default async function Settings() {
  const s = await requireStaff("manager");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="card max-w-2xl space-y-3 p-6 text-sm">
        <p><span className="text-muted">Signed in as:</span> {s.name} ({s.roles.join(", ")})</p>
        <p className="text-muted">Roles, users and system parameters are managed in Odoo (Settings → Users → Quiz Management). Roles are enforced by Odoo itself; this portal only mirrors them.</p>
      </div>
    </>
  );
}
