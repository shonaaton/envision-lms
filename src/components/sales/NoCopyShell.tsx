"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Copy deterrent for the sales workspace.
 *
 * Be honest about what this is. Blocking selection, copy and right-click stops
 * casual extraction - dragging a table into a spreadsheet - and nothing more. A
 * screenshot, devtools, or the network tab defeats all of it, and no browser API
 * can change that.
 *
 * The measures that actually matter are elsewhere: the server never sends this
 * team the collections and revenue figures they should not have, no export route
 * is reachable from `/api/sales/*`, and every view is written to the activity log.
 * The watermark here is the part that changes behaviour, because it survives a
 * screenshot and makes a leak attributable.
 *
 * Form controls stay selectable - blocking them breaks search boxes and date
 * inputs, and a search box is not the leak.
 */
export function NoCopyShell({ viewer, children }: { viewer: string; children: ReactNode }) {
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element?.closest) return false;
      return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
    };
    const block = (event: Event) => {
      if (isEditable(event.target)) return;
      event.preventDefault();
    };
    const blockKey = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "c" || key === "x" || key === "s" || key === "p" || key === "u")) {
        event.preventDefault();
      }
    };

    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", blockKey);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", blockKey);
    };
  }, []);

  const stamp = `${viewer} - ${new Date().toLocaleString("en-IN")}`;

  return (
    <div className="sales-guard relative">
      <style>{`
        .sales-guard { user-select: none; -webkit-user-select: none; }
        .sales-guard input,
        .sales-guard textarea,
        .sales-guard select,
        .sales-guard [contenteditable="true"] { user-select: text; -webkit-user-select: text; }
        @media print {
          .sales-guard > *:not(.sales-print-block) { display: none !important; }
          .sales-print-block { display: flex !important; }
        }
        .sales-print-block { display: none; }
      `}</style>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 select-none overflow-hidden opacity-[0.045]"
        style={{ transform: "rotate(-28deg)" }}
      >
        <div className="flex h-[200vh] w-[200vw] -translate-x-1/4 -translate-y-1/4 flex-wrap content-start gap-x-16 gap-y-24">
          {Array.from({ length: 90 }).map((_, index) => (
            <span key={index} className="whitespace-nowrap text-lg font-black uppercase tracking-widest text-slate-950">
              {stamp}
            </span>
          ))}
        </div>
      </div>

      <div className="sales-print-block h-screen w-full items-center justify-center p-10 text-center">
        <p className="text-lg font-bold text-slate-900">
          Printing is disabled for the sales workspace. This view is watermarked and access is logged.
        </p>
      </div>

      {children}
    </div>
  );
}

/** The one-line notice every sales page carries in its footer. */
export function SalesDataNotice() {
  return (
    <p className="mt-6 text-center text-[11px] text-slate-400">
      This view is watermarked with your name and every access is logged. Copying, printing and downloading are disabled.
    </p>
  );
}
