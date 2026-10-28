"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function WorkspaceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog?.open) dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} className="m-auto max-h-[90dvh] w-[min(900px,96vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-black/40"><div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white p-4"><h2 className="text-lg font-bold">{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button></div><div className="p-4">{children}</div></dialog>;
}
