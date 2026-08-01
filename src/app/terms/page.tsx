import { redirect } from "next/navigation";
import { LEGAL_LINKS } from "@/lib/publicLinks";

export default function TermsPage() {
  redirect(LEGAL_LINKS.terms);
}
