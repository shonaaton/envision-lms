import Image from "next/image";
import Link from "next/link";
import { ACADEMY_LOGO_URL } from "@/lib/branding";
import { DEMO_THANKS_PATH } from "@/lib/demoRequest";
import { publicMetadata } from "@/lib/seo";
import DemoSlotPicker from "./DemoSlotPicker";
import "../form/form.css";
import "./thanks.css";

/**
 * The last step of the /book-free-demo-class funnel: the form sends a family
 * here once their request is in, and they pick the demo slot they would like.
 *
 * Its own URL, rather than a state of the form, so an ad platform can count a
 * visit to it as the conversion. Not indexed. Shares the form's shell
 * (form.css, `.dform`); its own styles are in thanks.css under `.dthx`.
 */
export const metadata = publicMetadata({
  path: DEMO_THANKS_PATH,
  title: "Thank You | Free Demo Class | Envision Chess Academy",
  description: "Choose a date and time for your free online chess demo with Envision Chess Academy.",
  noindex: true,
});

export default function DemoThankYouPage() {
  return (
    <div className="dform dthx">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- matches the campaign page; next/font/google fetches at build time, which has failed the VPS deploy before. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Manrope:wght@600;700;800&display=swap"
      />
      <header className="dform-top">
        <Link href="/book-free-demo-class" aria-label="Back to the free demo page">
          <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={190} height={64} priority unoptimized />
        </Link>
      </header>
      <div className="dform-rank" aria-hidden="true" />
      <main className="dform-main">
        <DemoSlotPicker />
      </main>
    </div>
  );
}
