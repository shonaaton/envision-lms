"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, IndianRupee, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type PayLinkAction = (invoiceId: string) => Promise<{ url?: string; kind?: "razorpay" | "upi"; error?: string }>;

/**
 * Makes (or reuses) the invoice's pay link and copies it: the Razorpay link for
 * a GST invoice's current total, or the UPI pay page for a non-GST one. The
 * link also stays on screen: a browser may refuse a copy that lands after a
 * server round trip, and the second click is a fresh gesture.
 */
export function CopyPayLinkButton({ invoiceId, invoiceNumber, action }: { invoiceId: string; invoiceNumber: string; action: PayLinkAction }) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"razorpay" | "upi">("razorpay");
  const [copied, setCopied] = useState(false);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Pay link for ${invoiceNumber} copied.`);
      return true;
    } catch {
      return false;
    }
  }

  async function open() {
    setLoading(true);
    try {
      const result = await action(invoiceId);
      if (!result?.url) {
        toast.error(result?.error || "Could not make the pay link.");
        return;
      }
      setCopied(false);
      setKind(result.kind || "razorpay");
      setUrl(result.url);
      await copy(result.url);
    } catch {
      toast.error("Could not make the pay link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={open}
        disabled={loading}
        title="Copy pay link"
        aria-label="Copy pay link"
        className="grid h-8 w-8 place-items-center rounded-lg border border-sky-200 bg-white text-sky-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-md disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <IndianRupee size={14} />}
      </button>
      {url && (
        <div className="absolute right-0 top-10 z-40 w-80 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{kind === "upi" ? "UPI pay page" : "Razorpay link"} · {invoiceNumber}</p>
            <button type="button" onClick={() => setUrl("")} className="rounded p-0.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <input readOnly value={url} onFocus={(event) => event.target.select()} className="input h-9 w-full text-sm" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => copy(url)} className="btn-primary h-8 flex-1 text-xs">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="btn-outline h-8 text-xs">
              <ExternalLink size={14} /> Open
            </a>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            {kind === "upi"
              ? "Non-GST: a UPI QR for the exact amount due. UPI payments are not recorded automatically; mark the invoice paid once the money arrives."
              : "For the exact amount due; marked paid automatically. A late fee or waiver replaces it with a new link."}
          </p>
        </div>
      )}
    </span>
  );
}
