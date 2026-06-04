"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Logo({ className = "" }: { className?: string }) {
  const [branding, setBranding] = useState({ academyName: "Envision Chess Academy", logoUrl: "/logo-yellow.svg" });

  useEffect(() => {
    fetch("/api/branding")
      .then((res) => res.json())
      .then((data) => setBranding({ academyName: data.academyName || "Envision Chess Academy", logoUrl: data.logoUrl || "/logo-yellow.svg" }))
      .catch(() => {});
  }, []);

  return (
    <Link href="/" className={`inline-flex items-center ${className}`} aria-label={branding.academyName}>
      <img src={branding.logoUrl} alt={branding.academyName} className="h-12 w-auto object-contain" />
    </Link>
  );
}
