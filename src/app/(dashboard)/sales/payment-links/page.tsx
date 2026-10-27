import { redirect } from "next/navigation";
import PaymentLinksClient from "@/components/sales/PaymentLinksClient";
import { logSalesView, requireSalesViewer } from "@/lib/salesAudit";

export const dynamic = "force-dynamic";

export default async function PaymentLinksPage() {
  const viewer = await requireSalesViewer("salesPaymentLinks");
  if (!viewer) redirect("/dashboard");
  logSalesView(viewer, "salesPaymentLinks");
  return <PaymentLinksClient />;
}
