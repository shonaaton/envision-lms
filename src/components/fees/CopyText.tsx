"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyText({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the value is on screen to select by hand.
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : label}
    </button>
  );
}
