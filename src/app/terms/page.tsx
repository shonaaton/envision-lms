import type { Metadata } from "next";
import LegalPagePlaceholder from "@/components/marketing/LegalPagePlaceholder";

export const metadata: Metadata = { title: "Terms and Conditions | Envision Chess Academy" };

export default function TermsPage() {
  return <LegalPagePlaceholder title="Terms and Conditions" />;
}
