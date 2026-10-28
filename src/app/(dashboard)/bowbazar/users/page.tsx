import UsersClient from "@/components/bowbazar/UsersClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarUsersPage() {
  const { can } = await requireBranchPage("staff");
  return <UsersClient can={can} />;
}
