import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import Providers from "./providers";
import { ACADEMY_FAVICON_URL } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Envision Chess Academy",
  description: "Learn chess with classrooms, homework, PGN library, analysis board and more.",
  icons: { icon: ACADEMY_FAVICON_URL, apple: ACADEMY_FAVICON_URL },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <Toaster richColors theme="light" position="top-right" />
      </body>
    </html>
  );
}
