import "./globals.css";
import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { Toaster } from "sonner";
import PublicPageTracking from "@/components/marketing/PublicPageTracking";
import Providers from "./providers";
import { ACADEMY_FAVICON_URL } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Envision Chess Academy",
  description: "Learn chess with classrooms, homework, PGN library, analysis board and more.",
  manifest: "/manifest.webmanifest",
  icons: { icon: ACADEMY_FAVICON_URL, apple: ACADEMY_FAVICON_URL },
};

const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || "924225047079586";

// Handwriting face, used only for the landing hero's aside. Exposed as a CSS
// variable so Tailwind's `font-hand` picks it up without loading it everywhere.
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-hand", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={caveat.variable}>
      <body>
        <Providers>{children}</Providers>
        <PublicPageTracking pixelId={metaPixelId} />
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
