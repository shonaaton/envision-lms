import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Envision Chess Academy",
  description: "Learn chess with classrooms, homework, PGN library, analysis board and more.",
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
        <Toaster richColors theme="dark" position="top-right" />
      </body>
    </html>
  );
}
