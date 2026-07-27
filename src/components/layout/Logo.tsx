"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Logo({ className = "", tone = "yellow" }: { className?: string; tone?: "yellow" | "purple" }) {
  const fallbackLogo = tone === "purple" ? "/logo-purple.svg" : "/logo-yellow.svg";
  const [branding, setBranding] = useState({ academyName: "Envision Chess Academy", logoUrl: fallbackLogo });

  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setBranding({ academyName: data.academyName || "Envision Chess Academy", logoUrl: data.logoUrl || fallbackLogo }))
      .catch(() => {});
  }, [fallbackLogo]);

  return (
    <Link href="/" className={`inline-flex items-center ${className}`} aria-label={branding.academyName}>
      <Image src={branding.logoUrl} alt={branding.academyName} width={192} height={48} className="h-12 w-auto object-contain" unoptimized />
    </Link>
  );
}
