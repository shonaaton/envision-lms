import { redirect } from "next/navigation";

/**
 * The old Lead CRM screen (leads mirrored from Kraya) was taken off the sales
 * menu on 2026-11-10. Bookmarks land on the Demo Leads CRM that replaced it.
 * The mirror itself (src/lib/crm) still runs: demo owner routing reads it.
 */
export default function RetiredSalesCrmPage() {
  redirect("/sales/leads");
}
