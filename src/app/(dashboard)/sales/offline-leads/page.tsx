import { redirect } from "next/navigation";

/**
 * Offline leads are a stage of the Demo Leads CRM now ("Offline lead", with
 * the centre on each lead), not a CRM of their own (user, 2026-11-24). Old
 * links land on that tab.
 */
export default function OfflineLeadsPage() {
  redirect("/sales/leads?stage=offline");
}
