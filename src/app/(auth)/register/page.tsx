import type { Metadata } from "next";
import RegisterForm from "./RegisterForm";
import { publicMetadata } from "@/lib/seo";

/**
 * The demo form is a client component, so it cannot carry its own metadata.
 * This server wrapper exists to give it some: every call to action on the site
 * lands here and the sitemap lists it, but it was inheriting the root layout's
 * title with no description and no canonical - the generic portal blurb about
 * homework and PGN libraries, on the page a parent reaches from an ad.
 */
export const metadata: Metadata = publicMetadata({
  path: "/register",
  title: "Book a Free Demo Chess Class | Envision Chess Academy",
  description:
    "Book a free demo chess class online with a FIDE-rated coach. We assess your child's level, explain the course ladder and answer your questions - no payment needed.",
  socialDescription: "Book a free one-to-one chess demo class with a FIDE-rated coach at Envision Chess Academy.",
  keywords: ["free demo chess class", "book chess demo class", "free chess class online for kids", "chess assessment class"],
  imageAlt: "Envision Chess Academy student - book a free demo chess class",
});

export default function RegisterPage() {
  return <RegisterForm />;
}
