"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`mt-10 w-full ${wide ? "max-w-2xl" : "max-w-xl"} rounded-2xl border border-brand/10 bg-white p-5 shadow-2xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-black text-slate-950">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-5 text-slate-600">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{hint}</span>}
    </label>
  );
}
