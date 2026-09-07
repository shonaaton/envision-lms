import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { getCrmHealth } from "@/lib/crm/health";
import { CrmAdminClient } from "@/components/admin/CrmAdminClient";

export const dynamic = "force-dynamic";

export default async function CrmAdminPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) redirect("/login");
  if (!(await canAccessFeature("crmAdmin", user, "view"))) redirect("/dashboard");

  const health = await getCrmHealth();
  return <CrmAdminClient initial={JSON.parse(JSON.stringify(health))} />;
}
