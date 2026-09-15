import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A popup opened by linking to its id and closed by linking to "#". It runs on
 * CSS `:target` alone, so server components can use it without client code.
 */
export function PopupTrigger({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  return (
    <a href={`#${id}`} className={className}>{children}</a>
  );
}

export function PopupShell({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div id={id} className="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/55 p-4 target:flex">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <a href="#" className="grid h-9 w-9 flex-none place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:text-brand">
            <X size={16} />
          </a>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
