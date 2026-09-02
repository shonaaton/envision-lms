import "./globals.css";
import { Suspense } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import MetaPageViewTracker from "@/components/MetaPageViewTracker";
import Providers from "./providers";
import { ACADEMY_FAVICON_URL } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Envision Chess Academy",
  description: "Learn chess with classrooms, homework, PGN library, analysis board and more.",
  manifest: "/manifest.webmanifest",
  icons: { icon: ACADEMY_FAVICON_URL, apple: ACADEMY_FAVICON_URL },
};

const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || "924225047079586";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        <Providers>{children}</Providers>
        <Suspense fallback={null}>
          <MetaPageViewTracker />
        </Suspense>
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
