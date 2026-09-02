"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

type ServerAction = (formData: FormData) => Promise<void>;

export function SendInvoiceWhatsAppButton({ invoiceId, invoiceNumber, studentFilter, defaultMessage, action }: {
  invoiceId: string;
  invoiceNumber: string;
  studentFilter: string;
  defaultMessage: string;
  action: ServerAction;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("invoice");
  const [message, setMessage] = useState(defaultMessage);

  function selectKind(value: string) {
    setKind(value);
    if (value === "renewal") setMessage(`Hello, your renewal is due soon. Please review your renewal details and let us know if you need any help.`);
    if (value === "invoice") setMessage(defaultMessage);
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} title="Send WhatsApp notification" aria-label="Send WhatsApp notification" className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md"><MessageCircle size={14} /></button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <form action={action} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <input type="hidden" name="invoice" value={invoiceId} />
        <input type="hidden" name="studentFilter" value={studentFilter} />
        <input type="hidden" name="notificationKind" value={kind} />
        <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-bold text-slate-950">Send WhatsApp Notification</h3><p className="mt-1 text-sm text-slate-500">Choose a message and edit it before sending for {invoiceNumber}.</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600"><X size={16} /></button></div>
        <label className="block space-y-1"><span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Notification type</span><select value={kind} onChange={(event) => selectKind(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"><option value="invoice">Invoice notification</option><option value="renewal">Renewal reminder</option><option value="custom">Custom message</option></select></label>
        <label className="mt-3 block space-y-1"><span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Message</span><textarea name="message" required value={message} onChange={(event) => setMessage(event.target.value)} rows={7} maxLength={4000} className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" /></label>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancel</button><button disabled={!message.trim()} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white disabled:bg-slate-300"><MessageCircle size={15} /> Send WhatsApp</button></div>
      </form>
    </div>}
  </>;
}
