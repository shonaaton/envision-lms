import { redirect } from "next/navigation";

import RetentionClient from "@/components/admin/RetentionClient";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";

export const dynamic = "force-dynamic";

export default async function RetentionPage({ searchParams }: { searchParams?: { flag?: string } }) {
  const session = await requireRetentionAccess("view");
  if (!session) redirect("/dashboard?restricted=1");
  const canManage = Boolean(await requireRetentionAccess("manage"));
  return <RetentionClient canManage={canManage} initialFlagId={searchParams?.flag || ""} />;
}
