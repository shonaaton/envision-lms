"use client";

import { usePathname } from "next/navigation";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { isMarketingPath } from "@/lib/portalPaths";

const GREETING = "Hi Envision Chess Academy! I'd like to know more about your chess classes.";

/** wa.me wants the number as bare digits, country code first. */
const WHATSAPP_URL = `https://wa.me/${ACADEMY_DEFAULTS.phone.replace(/\D/g, "")}?text=${encodeURIComponent(GREETING)}`;

/**
 * A floating "chat on WhatsApp" button on the marketing and landing pages.
 *
 * Never in the portal: it would cover the board in a live classroom, and the
 * people signed in there already have Ask Coach. It is a plain `wa.me` link, so
 * `SiteAnalyticsTracker` already counts a tap as a contact click.
 *
 * It sits bottom-right because the toaster owns bottom-left, and below the
 * cookie banner (z-100) so a pending consent choice is never covered.
 */
export default function WhatsAppButton() {
  const pathname = usePathname();
  if (!isMarketingPath(pathname)) return null;

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[90] flex h-14 items-center gap-2 rounded-full bg-[#25D366] px-4 text-white shadow-[0_10px_30px_rgba(37,211,102,0.35)] transition hover:bg-[#1ebe5a] hover:shadow-[0_12px_34px_rgba(37,211,102,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] print:hidden sm:right-6"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-7 w-7 shrink-0 fill-current">
        <path d="M16.004 3C8.82 3 3.004 8.817 3.004 16c0 2.293.6 4.533 1.74 6.507L3 29l6.66-1.707A12.94 12.94 0 0 0 16.004 29C23.18 29 29 23.183 29 16S23.18 3 16.004 3Zm0 23.636a10.6 10.6 0 0 1-5.4-1.48l-.387-.23-3.953 1.013 1.053-3.853-.253-.4A10.58 10.58 0 0 1 5.37 16c0-5.863 4.773-10.637 10.637-10.637 5.86 0 10.63 4.774 10.63 10.637 0 5.863-4.77 10.636-10.633 10.636Zm5.833-7.966c-.32-.16-1.893-.934-2.187-1.04-.293-.107-.506-.16-.72.16-.213.32-.826 1.04-1.013 1.253-.187.214-.373.24-.693.08-.32-.16-1.35-.497-2.573-1.587-.95-.847-1.594-1.894-1.78-2.214-.187-.32-.02-.493.14-.653.144-.143.32-.373.48-.56.16-.187.213-.32.32-.533.107-.214.053-.4-.027-.56-.08-.16-.72-1.734-.986-2.374-.26-.624-.524-.54-.72-.55l-.613-.01c-.214 0-.56.08-.854.4-.293.32-1.12 1.093-1.12 2.667 0 1.573 1.147 3.093 1.307 3.307.16.213 2.257 3.446 5.467 4.833.764.33 1.36.527 1.825.674.767.244 1.465.21 2.017.127.615-.092 1.893-.774 2.16-1.52.267-.747.267-1.387.187-1.52-.08-.134-.293-.214-.613-.374Z" />
      </svg>
      <span className="hidden text-sm font-semibold sm:inline">Chat with us</span>
    </a>
  );
}
