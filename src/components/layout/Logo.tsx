import Image from "next/image";
import Link from "next/link";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center ${className}`} aria-label="Envision Chess Academy">
      <Image src="/logo-yellow.svg" alt="Envision Chess Academy" width={220} height={68} priority className="h-12 w-auto" />
    </Link>
  );
}
