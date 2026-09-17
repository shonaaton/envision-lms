import type { Metadata } from "next";
import RegisterForm from "./RegisterForm";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

const pageUrl = `${MARKETING_BASE_URL}/register`;

/**
 * The demo form is a client component, so it cannot carry its own metadata.
 * This server wrapper exists to give it some: every call to action on the site
 * lands here and the sitemap lists it, but it was inheriting the root layout's
 * title with no description and no canonical - the generic portal blurb about
 * homework and PGN libraries, on the page a parent reaches from an ad.
 */
export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_BASE_URL),
  title: "Book a Free Demo Class | Envision Chess Academy",
  description:
    "Book a free one-to-one chess demo class with a FIDE-rated coach. We assess your child's level, explain the course ladder and answer your questions - no payment needed.",
  alternates: { canonical: pageUrl },
  openGraph: {
    title: "Book a Free Demo Class | Envision Chess Academy",
    description:
      "Book a free one-to-one chess demo class with a FIDE-rated coach at Envision Chess Academy.",
    url: pageUrl,
    type: "website",
  },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
