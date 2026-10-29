import { notFound, redirect } from "next/navigation";
import ReceiptSheet from "@/components/bowbazar/ReceiptSheet";
import { requireBranchStudent } from "@/lib/branch/http";
import { receiptFor } from "@/lib/branch/receipts";

export const dynamic = "force-dynamic";

/** A family's own receipt: only payments on this student's bills open. */
export default async function MyBowbazarReceiptPage({ params }: { params: { paymentId: string } }) {
  const me = await requireBranchStudent();
  if (!me) redirect("/bowbazar/me");
  const receipt = await receiptFor(me.branch, params.paymentId, String(me.student._id)).catch(() => null);
  if (!receipt) notFound();
  return <ReceiptSheet receipt={receipt} />;
}
