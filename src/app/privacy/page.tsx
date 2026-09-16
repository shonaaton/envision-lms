import type { Metadata } from "next";
import LegalPagePlaceholder from "@/components/marketing/LegalPagePlaceholder";

export const metadata: Metadata = { title: "Privacy Policy | Envision Chess Academy" };

export default function PrivacyPage() {
  return <LegalPagePlaceholder title="Privacy Policy" />;
}
