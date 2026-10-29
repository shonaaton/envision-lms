import { notFound } from "next/navigation";
import ReceiptSheet from "@/components/bowbazar/ReceiptSheet";
import { requireBranchPage } from "@/lib/branch/page";
import { receiptFor } from "@/lib/branch/receipts";

export const dynamic = "force-dynamic";

export default async function BowbazarReceiptPage({ params }: { params: { paymentId: string } }) {
  const { branch } = await requireBranchPage("fees");
  const receipt = await receiptFor(branch, params.paymentId).catch(() => null);
  if (!receipt) notFound();
  return <ReceiptSheet receipt={receipt} />;
}
