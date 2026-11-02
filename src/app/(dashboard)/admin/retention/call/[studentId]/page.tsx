import { redirect } from "next/navigation";

import FamilyCallClient from "@/components/admin/retention/FamilyCallClient";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";

export const dynamic = "force-dynamic";

/** One family's call screen: what each child is doing, the talking points, past calls and the call form. */
export default async function FamilyCallPage({ params, searchParams }: { params: { studentId: string }; searchParams?: { kind?: string } }) {
  const session = await requireRetentionAccess("view");
  if (!session) redirect("/dashboard?restricted=1");
  const canManage = Boolean(await requireRetentionAccess("manage"));
  return (
    <FamilyCallClient
      studentId={params.studentId}
      initialKind={searchParams?.kind || "monthly"}
      canManage={canManage}
      callerName={String((session.user as any)?.name || "")}
    />
  );
}
