import { PageHeader } from "@/components/ui";
import { ImportClient } from "@/components/import-client";
import { requireStaff } from "@/lib/auth/session";

export const metadata = { title: "Import questions" };
export default async function ImportPage() {
  await requireStaff("teacher");
  return (<><PageHeader title="Import questions" subtitle="CSV or XLSX. Validate first, then import." /><ImportClient /></>);
}
