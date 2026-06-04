"use client";
import Image from "next/image";
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
      <Image src={branding.logoUrl} alt={branding.academyName} width={220} height={68} priority className="h-12 w-auto object-contain" />
    </Link>
  );
}
