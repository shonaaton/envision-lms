"use client";

import { Printer } from "lucide-react";

export default function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-outline h-9 px-3 text-sm" onClick={() => window.print()}>
      <Printer size={15} /> {label}
    </button>
  );
}
