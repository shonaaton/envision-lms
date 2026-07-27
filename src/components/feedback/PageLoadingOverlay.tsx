"use client";

import { Loader2, Sparkles } from "lucide-react";

export default function PageLoadingOverlay({
  visible,
  message = "Loading...",
}: {
  visible: boolean;
  message?: string;
}) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-white/72 backdrop-blur-sm">
      <div className="flex min-w-[240px] max-w-[90vw] items-center gap-4 rounded-lg border border-brand/15 bg-white px-5 py-4 shadow-2xl shadow-brand/15">
        <div className="relative grid h-12 w-12 place-items-center rounded-lg bg-brand text-white shadow-lg shadow-brand/25">
          <Loader2 size={22} className="animate-spin" />
          <Sparkles size={12} className="absolute -right-1 -top-1 rounded-full bg-accent p-0.5 text-brand" />
        </div>
        <div>
          <div className="text-sm font-black text-brand">Please wait</div>
          <div className="mt-1 text-sm text-slate-600">{message}</div>
        </div>
      </div>
    </div>
  );
}
