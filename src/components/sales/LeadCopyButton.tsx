"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

export function LeadCopyButton({ text, label, caption = label, compact = false }: { text: string; label: string; caption?: string; compact?: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      // Older browsers and embedded webviews may not expose the Clipboard API.
      const active = document.activeElement;
      const selection = window.getSelection();
      const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
      const input = document.createElement("textarea");
      input.value = text;
      input.readOnly = true;
      input.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(input);
      try {
        input.select();
        if (!document.execCommand("copy")) throw new Error("Copy failed");
        toast.success("Copied to clipboard.");
      } catch {
        toast.error("Could not copy. Select the details and copy them manually.");
      } finally {
        input.remove();
        if (active instanceof HTMLElement) active.focus({ preventScroll: true });
        selection?.removeAllRanges();
        ranges.forEach((range) => selection?.addRange(range));
      }
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-md text-brand hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${compact ? "min-h-7 min-w-7 align-middle" : "min-h-9 border border-brand/20 bg-white px-2 py-1 text-xs font-bold"}`}
    >
      <Copy size={14} aria-hidden="true" />
      {!compact ? caption : null}
    </button>
  );
}
