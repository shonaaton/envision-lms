import { redirect } from "next/navigation";
import { LEGAL_LINKS } from "@/lib/publicLinks";

export default function PrivacyPage() {
  redirect(LEGAL_LINKS.privacy);
}
