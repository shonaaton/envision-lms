import AccountsClient from "@/components/bowbazar/AccountsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarAccountsPage() {
  const { can } = await requireBranchPage("fees");
  return <AccountsClient can={can} />;
}
