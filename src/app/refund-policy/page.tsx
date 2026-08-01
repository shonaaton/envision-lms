import { redirect } from "next/navigation";
import { LEGAL_LINKS } from "@/lib/publicLinks";

export default function RefundPolicyPage() {
  redirect(LEGAL_LINKS.refund);
}
