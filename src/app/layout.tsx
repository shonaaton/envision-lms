import "./globals.css";
import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { Toaster } from "sonner";
import PublicPageTracking from "@/components/marketing/PublicPageTracking";
import Providers from "./providers";
import { ACADEMY_FAVICON_URL } from "@/lib/branding";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";
import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/lib/seo";

/**
 * Defaults for any page that does not describe itself. Public pages override
 * all of this; the portal pages behind the login inherit it, and are kept out
 * of the index by `robots.ts` rather than here. There is deliberately no title
 * template - every public page already writes its full "... | Envision" title.
 */
export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_BASE_URL),
  title: SITE_NAME,
  description:
    "Envision Chess Academy: live online chess classes for kids and adults across India and abroad, a 240-session curriculum, weekly tournaments and four Kolkata centres.",
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  icons: { icon: ACADEMY_FAVICON_URL, apple: ACADEMY_FAVICON_URL },
  openGraph: {
    siteName: SITE_NAME,
    locale: "en_IN",
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 900, alt: "Envision Chess Academy student with a tournament trophy" }],
  },
  twitter: { card: "summary_large_image" },
};

const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || "924225047079586";
const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";

// Handwriting face, used only for the landing hero's aside. Exposed as a CSS
// variable so Tailwind's `font-hand` picks it up without loading it everywhere.
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-hand", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={caveat.variable}>
      <body>
        <Providers>{children}</Providers>
        <PublicPageTracking pixelId={metaPixelId} googleAnalyticsId={googleAnalyticsId} />
        <Toaster
          richColors
          theme="light"
          position="bottom-left"
          duration={1400}
          visibleToasts={2}
          offset={16}
        />
      </body>
    </html>
  );
}
