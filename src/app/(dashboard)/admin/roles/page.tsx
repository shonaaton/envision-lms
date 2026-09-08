import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/featureAccess";
import RoleManager from "@/components/admin/RoleManager";

export default async function RolesPage() {
  if (!(await requireSuperAdmin())) redirect("/dashboard");
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><RoleManager /></div>;
}
