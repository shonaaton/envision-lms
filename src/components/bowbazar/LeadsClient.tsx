"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Inbox, Loader2, Mail, MessageCircle, Phone, RotateCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge, BranchHeader, Drawer, EmptyState, Field, MoreMenu, Panel, Stat, api, type BadgeTone } from "./shared";
import { SentDrawer, StartDrawer, type Delivery } from "./AdmissionsClient";
import type { Slot } from "./SlotsClient";

type Lead = {
  id: string;
  name: string;
  email: string;
  countryCode: string;
  phone: string;
  address: string;
  message: string;
  status: "new" | "contacted" | "converted" | "closed";
  note: string;
  autoReply: { email: string; whatsapp: string; sentAt: string | null };
  admissionId: string;
  createdAt: string;
  updatedByName: string;
};

const STATUS: Record<Lead["status"], { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "info" as BadgeTone },
  contacted: { label: "Contacted", tone: "warn" as BadgeTone },
  converted: { label: "Admission sent", tone: "good" as BadgeTone },
  closed: { label: "Closed", tone: "muted" as BadgeTone },
};

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

const replyLabel = (state: string) => (state === "sent" ? "sent" : state === "none" ? "not given" : "not sent");

/**
 * Lead Center: families who asked about the centre on the website. Each was
 * sent the open slots and fees automatically; from here staff call them, send
 * the details again and convert the lead by sending the admission form.
 */
export default function LeadsClient({ can }: { can: string[] }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [filter, setFilter] = useState<"open" | Lead["status"] | "all">("open");
  const [converting, setConverting] = useState<Lead | null>(null);
  const [sent, setSent] = useState<{ name: string; delivery: Delivery } | null>(null);
  const [noting, setNoting] = useState<Lead | null>(null);
  const [message, setMessage] = useState<{ lead: Lead; text: string; whatsappLink: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, slotData] = await Promise.all([api<{ leads: Lead[] }>("/api/bowbazar/leads"), api<{ slots: Slot[] }>("/api/bowbazar/slots")]);
      setLeads(data.leads);
      setSlots(slotData.slots.filter((slot) => slot.mode !== "online"));
    } catch (error: any) {
      toast.error(error.message);
      setLeads([]);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const replace = (lead: Lead) => setLeads((current) => (current || []).map((entry) => (entry.id === lead.id ? lead : entry)));

  async function patch(lead: Lead, json: Record<string, unknown>, done?: string) {
    try {
      const data = await api<{ lead: Lead; message?: string; whatsappLink?: string }>(`/api/bowbazar/leads/${lead.id}`, { method: "PATCH", json });
      replace(data.lead);
      if (done) toast.success(done);
      return data;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  }

  async function showMessage(lead: Lead) {
    const data = await patch(lead, { action: "message" });
    if (data?.message) setMessage({ lead, text: data.message, whatsappLink: data.whatsappLink || "" });
  }

  const counts = useMemo(() => {
    const out: Record<string, number> = { open: 0, new: 0, contacted: 0, converted: 0, closed: 0, all: 0 };
    for (const lead of leads || []) {
      out[lead.status] += 1;
      out.all += 1;
      if (lead.status === "new" || lead.status === "contacted") out.open += 1;
    }
    return out;
  }, [leads]);

  const shown = (leads || []).filter((lead) =>
    filter === "all" ? true : filter === "open" ? lead.status === "new" || lead.status === "contacted" : lead.status === filter
  );

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Lead Center"
        subtitle="Families who asked about the centre on the website. They got the open slots and fees automatically; call them, then send the admission form."
        can={can}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="To follow up" value={counts.open} tone={counts.new ? "warn" : "default"} onClick={() => setFilter("open")} active={filter === "open"} hint={`${counts.new} new`} />
        <Stat label="Contacted" value={counts.contacted} onClick={() => setFilter("contacted")} active={filter === "contacted"} />
        <Stat label="Admission sent" value={counts.converted} tone="good" onClick={() => setFilter("converted")} active={filter === "converted"} />
        <Stat label="All leads" value={counts.all} onClick={() => setFilter("all")} active={filter === "all"} hint={`${counts.closed} closed`} />
      </div>

      <Panel title="Leads" subtitle="Newest first">
        {!leads ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading leads...
          </div>
        ) : !shown.length ? (
          <EmptyState icon={<Inbox size={20} />} title="No leads here" hint="Enquiries from the website's contact form, with this centre chosen, land here." />
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map((lead) => {
              const phone = `${lead.countryCode || ""} ${lead.phone}`.trim();
              const telHref = `tel:${(lead.countryCode || "+91").replace(/\s/g, "")}${lead.phone}`;
              return (
                <article key={lead.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black text-slate-950">{lead.name}</span>
                      <Badge tone={STATUS[lead.status].tone}>{STATUS[lead.status].label}</Badge>
                      <span className="text-xs text-slate-400">{when(lead.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <a href={telHref} className="inline-flex items-center gap-1 hover:text-brand">
                        <Phone size={13} /> {phone}
                      </a>
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 break-all hover:text-brand">
                          <Mail size={13} /> {lead.email}
                        </a>
                      )}
                    </div>
                    {lead.address && <p className="text-xs text-slate-500">{lead.address}</p>}
                    {lead.message && <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{lead.message}</p>}
                    <p className="text-xs text-slate-500">
                      Slots and fees {lead.autoReply.sentAt ? `sent ${when(lead.autoReply.sentAt)}` : "not sent yet"} · email {replyLabel(lead.autoReply.email)} · WhatsApp{" "}
                      {replyLabel(lead.autoReply.whatsapp)}
                    </p>
                    {lead.note && <p className="text-xs font-semibold text-amber-800">Note: {lead.note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {lead.status !== "converted" && (
                      <button type="button" className="btn-primary h-9 px-3 text-sm" onClick={() => setConverting(lead)}>
                        <UserPlus size={15} /> Send admission form
                      </button>
                    )}
                    <button type="button" className="btn-outline h-9 px-3 text-sm" onClick={() => void showMessage(lead)}>
                      <MessageCircle size={15} /> WhatsApp
                    </button>
                    <MoreMenu
                      items={[
                        lead.status === "new" && { label: "Mark contacted", onClick: () => void patch(lead, { status: "contacted" }, "Marked contacted.") },
                        { label: "Send slots and fees again", onClick: () => void patch(lead, { action: "resend" }, "Slots and fees sent again.") },
                        { label: lead.note ? "Edit note" : "Add a note", onClick: () => setNoting(lead) },
                        lead.status !== "closed" && lead.status !== "converted" && { label: "Close lead", onClick: () => void patch(lead, { status: "closed" }, "Lead closed.") },
                        (lead.status === "closed" || lead.status === "converted") && { label: "Reopen", onClick: () => void patch(lead, { status: "contacted" }, "Lead reopened.") },
                      ]}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {converting && (
        <StartDrawer
          slots={slots}
          leadId={converting.id}
          initial={{
            parentName: converting.name,
            phone: !converting.countryCode || converting.countryCode === "+91" ? converting.phone : "",
            email: converting.email,
            note: converting.message ? `From the website enquiry: ${converting.message}` : "From the website enquiry",
          }}
          onClose={() => setConverting(null)}
          onSent={(name, delivery) => {
            setConverting(null);
            setSent({ name, delivery });
            void load();
          }}
        />
      )}
      {sent && <SentDrawer name={sent.name} delivery={sent.delivery} onClose={() => setSent(null)} />}
      {noting && (
        <NoteDrawer
          lead={noting}
          onClose={() => setNoting(null)}
          onSave={async (note) => {
            const data = await patch(noting, { note }, "Note saved.");
            if (data) setNoting(null);
          }}
        />
      )}
      {message && <MessageDrawer {...message} onClose={() => setMessage(null)} />}
    </div>
  );
}

function NoteDrawer({ lead, onClose, onSave }: { lead: Lead; onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const [note, setNote] = useState(lead.note);
  const [saving, setSaving] = useState(false);
  return (
    <Drawer
      title={`Note on ${lead.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary h-10"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(note);
              setSaving(false);
            }}
          >
            {saving && <Loader2 size={16} className="animate-spin" />} Save
          </button>
        </>
      }
    >
      <Field label="Note" hint="For the centre only">
        <textarea className="input min-h-[90px]" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </Drawer>
  );
}

function MessageDrawer({ lead, text, whatsappLink, onClose }: { lead: Lead; text: string; whatsappLink: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Drawer title={`Message for ${lead.name}`} onClose={onClose} footer={<button type="button" className="btn-primary h-10" onClick={onClose}>Done</button>}>
      <p className="text-sm text-slate-600">Today&apos;s open slots and fees, ready to send from your phone.</p>
      <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{text}</pre>
      <div className="flex flex-wrap gap-2">
        {whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="btn-primary h-10 px-4">
            <MessageCircle size={16} /> Open WhatsApp
          </a>
        )}
        <button
          type="button"
          className={cn("btn-outline h-10 px-4")}
          onClick={async () => {
            await navigator.clipboard?.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />} Copy message
        </button>
        <button type="button" className="btn-outline h-10 px-4" onClick={onClose}>
          <RotateCw size={16} /> Close
        </button>
      </div>
    </Drawer>
  );
}
