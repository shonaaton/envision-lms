"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import MetaPageViewTracker from "@/components/MetaPageViewTracker";
import CookieConsent from "@/components/marketing/CookieConsent";
import MetaPixel from "@/components/marketing/MetaPixel";
import SiteAnalyticsTracker from "@/components/marketing/SiteAnalyticsTracker";
import { isPortalPath } from "@/lib/portalPaths";

/**
 * Advertising and analytics, on the public pages only.
 *
 * These used to sit in the root layout, which meant the Meta Pixel and the page
 * view tracker also ran on every signed-in dashboard page - where the person at
 * the keyboard is usually a child. The pixel was already gated on marketing
 * consent, so this was never a consent bug; the problem was scope. A parent
 * accepts marketing cookies on the public site and that choice follows them into
 * the portal, where the browsing is the child's.
 *
 * Section 9(3) of the Digital Personal Data Protection Act, 2023 bars tracking
 * and behavioural monitoring of children, and unlike most processing under that
 * Act, parental consent does not cure it. So the portal gets nothing at all.
 *
 * `/booking` is inside the portal and fires a `Schedule` pixel event on a demo
 * booking. Losing that browser event costs no attribution: `api/bookings` sends
 * the same conversion server-side through the Conversions API with the same
 * `eventId`, which is the half of the pair Meta keeps when it deduplicates.
 *
 * The consent banner is gated too. Nothing on these pages tracks anyone, so
 * there is no choice to put to the reader; the footer's cookie settings link
 * still reopens the panel on every public page.
 */
export default function PublicPageTracking({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  if (isPortalPath(pathname)) return null;

  return (
    <>
      <MetaPixel pixelId={pixelId} />
      <Suspense fallback={null}>
        <MetaPageViewTracker />
        <SiteAnalyticsTracker />
      </Suspense>
      <CookieConsent />
    </>
  );
}
