import Image from "next/image";
import Link from "next/link";
import { academyLogoUrl } from "@/lib/branding";
import { publicMetadata } from "@/lib/seo";
import DemoRequestForm from "./DemoRequestForm";
import "./form.css";

/**
 * Where every "Book a free demo" button on /book-free-demo-class leads.
 *
 * Not indexed: it is a step in the campaign page's funnel, and the page before
 * it is the one that should rank. Styles live in form.css under `.dform`.
 */
export const metadata = publicMetadata({
  path: "/book-free-demo-class/form",
  title: "Share Your Details | Free Demo Class | Envision Chess Academy",
  description: "Share a few details and verify your WhatsApp number to book a free chess demo class with Envision Chess Academy.",
  noindex: true,
});

export default function DemoFormPage() {
  return (
    <div className="dform">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- matches the campaign page; next/font/google fetches at build time, which has failed the VPS deploy before. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap"
      />
      <header className="dform-top">
        <Link href="/book-free-demo-class" aria-label="Back to the free demo page">
          <Image src={academyLogoUrl()} alt="Envision Chess Academy" width={190} height={64} priority unoptimized />
        </Link>
      </header>
      <div className="dform-rank" aria-hidden="true" />
      <main className="dform-main">
        <DemoRequestForm />
      </main>
    </div>
  );
}
