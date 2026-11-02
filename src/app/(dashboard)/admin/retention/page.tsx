import { redirect } from "next/navigation";

import RetentionCenterClient from "@/components/admin/retention/RetentionCenterClient";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";

export const dynamic = "force-dynamic";

export default async function RetentionPage({ searchParams }: { searchParams?: { flag?: string; tab?: string; student?: string } }) {
  const session = await requireRetentionAccess("view");
  if (!session) redirect("/dashboard?restricted=1");
  const canManage = Boolean(await requireRetentionAccess("manage"));
  return (
    <RetentionCenterClient
      canManage={canManage}
      initialTab={searchParams?.tab || ""}
      initialFlagId={searchParams?.flag || ""}
      initialStudentId={searchParams?.student || ""}
    />
  );
}
