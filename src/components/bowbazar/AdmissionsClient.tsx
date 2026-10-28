"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, FileText, Loader2, MessageCircle, Plus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BranchHeader, CredentialsNote, Drawer, Field, SlotPicker, api, rupees } from "./shared";
import type { Slot } from "./SlotsClient";

type Admission = {
  id: string;
  status: "sent" | "expired" | "submitted" | "approved" | "rejected" | "cancelled";
  prefill: { name: string; parentName: string; phone: string; email: string; slots: string[]; slotLabels: string[]; monthlyFee: number; note: string };
  form: null | {
    name: string;
    dateOfBirth: string;
    school: string;
    parentName: string;
    fatherName: string;
    motherName: string;
    phone: string;
    email: string;
    address: string;
  };
  hasPhoto: boolean;
  hasIdDocument: boolean;
  idDocumentType: string;
  expiresAt: string;
  sends: number;
  lastSentAt: string;
  createdAt: string;
  createdByName: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedByName: string;
  rejectReason: string;
  studentId: string;
};

type Delivery = { link: string; message: string; whatsappLink: string; email: "sent" | "failed" | "none"; whatsapp: "sent" | "failed" };

const STATUS: Record<Admission["status"], { label: string; style: string }> = {
  sent: { label: "Waiting for family", style: "bg-amber-100 text-amber-900" },
  expired: { label: "Link expired", style: "bg-slate-200 text-slate-700" },
  submitted: { label: "To review", style: "bg-sky-100 text-sky-800" },
  approved: { label: "Added", style: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Turned down", style: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", style: "bg-slate-200 text-slate-700" },
};

const TABS = [
  { key: "review", label: "To review", statuses: ["submitted"] },
  { key: "waiting", label: "Waiting for family", statuses: ["sent", "expired"] },
  { key: "done", label: "Done", statuses: ["approved", "rejected", "cancelled"] },
] as const;

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export default function AdmissionsClient({ can }: { can: string[] }) {
  const [admissions, setAdmissions] = useState<Admission[] | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("review");
  const [starting, setStarting] = useState(false);
  const [sent, setSent] = useState<{ name: string; delivery: Delivery } | null>(null);
  const [reviewing, setReviewing] = useState<Admission | null>(null);

  const load = useCallback(async () => {
    try {
      const [admissionData, slotData] = await Promise.all([
        api<{ admissions: Admission[] }>("/api/bowbazar/admissions"),
        api<{ slots: Slot[] }>("/api/bowbazar/slots"),
      ]);
      setAdmissions(admissionData.admissions);
      setSlots(slotData.slots);
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((entry) => [entry.key, (admissions || []).filter((item) => (entry.statuses as readonly string[]).includes(item.status)).length])),
    [admissions]
  );
  // Open on whatever needs attention.
  useEffect(() => {
    if (admissions && !counts.review && counts.waiting) setTab((current) => (current === "review" ? "waiting" : current));
  }, [admissions, counts.review, counts.waiting]);

  const shown = (admissions || []).filter((item) => (TABS.find((entry) => entry.key === tab)!.statuses as readonly string[]).includes(item.status));

  async function resend(admission: Admission) {
    try {
      const data = await api<{ delivery: Delivery }>(`/api/bowbazar/admissions/${admission.id}`, { method: "PATCH", json: { action: "resend" } });
      setSent({ name: admission.prefill.name, delivery: data.delivery });
      void load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function cancel(admission: Admission) {
    if (!window.confirm(`Cancel ${admission.prefill.name}'s admission? The link will stop working.`)) return;
    try {
      await api(`/api/bowbazar/admissions/${admission.id}`, { method: "PATCH", json: { action: "cancel" } });
      toast.success("Cancelled.");
      void load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Admissions"
        subtitle="Send a family the admission form, then review what they send back and add the student."
        can={can}
        actions={
          <button type="button" className="btn-primary h-10" onClick={() => setStarting(true)}>
            <Plus size={16} /> New admission
          </button>
        }
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={cn("rounded-md px-3 py-1.5", tab === entry.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {entry.label}
            {counts[entry.key] ? <span className="ml-1.5 opacity-80">{counts[entry.key]}</span> : null}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
        {!admissions ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading admissions...
          </div>
        ) : !shown.length ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {tab === "review" ? "No forms waiting for review." : tab === "waiting" ? "No links out with families." : "Nothing here yet."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map((admission) => (
              <article key={admission.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black text-slate-950">{admission.form?.name || admission.prefill.name}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS[admission.status].style)}>{STATUS[admission.status].label}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {[admission.form?.parentName || admission.form?.fatherName || admission.prefill.parentName, admission.form?.phone || admission.prefill.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {admission.status === "submitted" && `Filled in ${day(admission.submittedAt)}`}
                    {admission.status === "sent" && `Sent ${day(admission.lastSentAt)} by ${admission.createdByName || "staff"} · link works until ${day(admission.expiresAt)}`}
                    {admission.status === "expired" && `Link expired ${day(admission.expiresAt)}`}
                    {["approved", "rejected", "cancelled"].includes(admission.status) && `${STATUS[admission.status].label} ${day(admission.decidedAt)} by ${admission.decidedByName || "staff"}`}
                    {admission.rejectReason && ` · ${admission.rejectReason}`}
                    {admission.prefill.slotLabels.length > 0 && ` · ${admission.prefill.slotLabels.join(", ")}`}
                    {admission.prefill.monthlyFee > 0 && ` · ${rupees(admission.prefill.monthlyFee)}/month`}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {admission.status === "submitted" && (
                    <button type="button" className="btn-primary h-9 px-3 text-sm" onClick={() => setReviewing(admission)}>
                      Review
                    </button>
                  )}
                  {(admission.status === "sent" || admission.status === "expired") && (
                    <>
                      <button type="button" className="btn-outline h-9 px-3 text-sm" onClick={() => void resend(admission)}>
                        <RotateCw size={14} /> {admission.status === "expired" ? "Send a new link" : "Send again"}
                      </button>
                      <button type="button" className="btn-outline h-9 px-3 text-sm text-red-700" onClick={() => void cancel(admission)}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {starting && (
        <StartDrawer
          slots={slots}
          onClose={() => setStarting(false)}
          onSent={(name, delivery) => {
            setStarting(false);
            setSent({ name, delivery });
            setTab("waiting");
            void load();
          }}
        />
      )}
      {sent && <SentDrawer name={sent.name} delivery={sent.delivery} onClose={() => setSent(null)} />}
      {reviewing && (
        <ReviewDrawer
          admission={reviewing}
          slots={slots}
          onClose={() => setReviewing(null)}
          onDone={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}

function StartDrawer({ slots, onClose, onSent }: { slots: Slot[]; onClose: () => void; onSent: (name: string, delivery: Delivery) => void }) {
  const [form, setForm] = useState({ name: "", parentName: "", phone: "", email: "", monthlyFee: "", note: "", slots: [] as string[] });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function send() {
    setSaving(true);
    try {
      const data = await api<{ delivery: Delivery }>("/api/bowbazar/admissions", { method: "POST", json: form });
      onSent(form.name, data.delivery);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title="New admission"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" onClick={() => void send()} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} Send the form
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        The family gets a link on WhatsApp{form.email ? " and email" : ""} to fill in the student&apos;s details and upload a photo and an identity document.
      </p>
      <Field label="Student's name *">
        <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Parent's name">
          <input className="input" value={form.parentName} onChange={(event) => set({ parentName: event.target.value })} />
        </Field>
        <Field label="Parent's WhatsApp number *">
          <input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
        </Field>
        <Field label="Email" hint="Optional; the link goes here too">
          <input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} />
        </Field>
        <Field label="Monthly fee (₹)" hint="Can be changed when you approve">
          <input className="input" inputMode="decimal" value={form.monthlyFee} onChange={(event) => set({ monthlyFee: event.target.value })} />
        </Field>
      </div>
      <SlotPicker slots={slots} value={form.slots} onChange={(value) => set({ slots: value })} />
      <p className="text-xs text-slate-500">The seat is only taken when you approve the form.</p>
      <Field label="Note for the centre" hint="Not shown to the family">
        <textarea className="input min-h-[60px]" value={form.note} onChange={(event) => set({ note: event.target.value })} />
      </Field>
    </Drawer>
  );
}

function SentDrawer({ name, delivery, onClose }: { name: string; delivery: Delivery; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const copy = async (what: string, value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopied(what);
  };
  const line = (label: string, state: string) => (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <span className={cn("font-bold", state === "sent" ? "text-emerald-700" : state === "none" ? "text-slate-400" : "text-amber-700")}>
        {state === "sent" ? "Sent" : state === "none" ? "No email given" : "Not sent"}
      </span>
    </div>
  );
  return (
    <Drawer title={`Form sent for ${name}`} onClose={onClose} footer={<button type="button" className="btn-primary h-10" onClick={onClose}>Done</button>}>
      <div className="space-y-2">
        {line("WhatsApp", delivery.whatsapp)}
        {line("Email", delivery.email)}
      </div>
      {delivery.whatsapp !== "sent" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          WhatsApp did not go out automatically (the message template may still be waiting for Meta&apos;s approval). Send it from your phone with the button below.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {delivery.whatsappLink && (
          <a href={delivery.whatsappLink} target="_blank" rel="noreferrer" className="btn-primary h-10 px-4">
            <MessageCircle size={16} /> Open WhatsApp
          </a>
        )}
        <button type="button" className="btn-outline h-10 px-4" onClick={() => void copy("message", delivery.message)}>
          {copied === "message" ? <Check size={16} /> : <Copy size={16} />} Copy message
        </button>
        <button type="button" className="btn-outline h-10 px-4" onClick={() => void copy("link", delivery.link)}>
          {copied === "link" ? <Check size={16} /> : <Copy size={16} />} Copy link
        </button>
      </div>
      <p className="break-all rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">{delivery.link}</p>
      <p className="text-xs text-slate-500">This link is shown only now. To send it again later, use &quot;Send again&quot;; that makes a new link and the old one stops working.</p>
    </Drawer>
  );
}

function ReviewDrawer({ admission, slots, onClose, onDone }: { admission: Admission; slots: Slot[]; onClose: () => void; onDone: () => void }) {
  const source = admission.form!;
  const [form, setForm] = useState({
    name: source.name,
    dateOfBirth: source.dateOfBirth,
    school: source.school,
    parentName: source.parentName,
    fatherName: source.fatherName,
    motherName: source.motherName,
    phone: source.phone,
    email: source.email,
    address: source.address,
    monthlyFee: admission.prefill.monthlyFee ? String(admission.prefill.monthlyFee / 100) : "",
    notes: admission.prefill.note,
    slots: admission.prefill.slots,
    sendLogin: true,
  });
  const [busy, setBusy] = useState<"" | "approve" | "reject">("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [credentials, setCredentials] = useState<{ username: string; password: string; note?: string } | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const file = (kind: string) => `/api/bowbazar/admissions/${admission.id}/file?kind=${kind}`;

  async function approve() {
    setBusy("approve");
    try {
      const data = await api<{ username: string; password: string; emailSent: boolean }>(`/api/bowbazar/admissions/${admission.id}`, {
        method: "PATCH",
        json: { action: "approve", ...form },
      });
      setCredentials({
        username: data.username,
        password: data.password,
        note: form.sendLogin
          ? `Sent to the family on WhatsApp${data.emailSent ? " and by email" : ""}. If it doesn't reach them, share these by hand.`
          : undefined,
      });
      toast.success(`${form.name} added.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  async function reject() {
    setBusy("reject");
    try {
      await api(`/api/bowbazar/admissions/${admission.id}`, { method: "PATCH", json: { action: "reject", reason } });
      toast.success("Turned down. The uploaded files were deleted.");
      onDone();
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  if (credentials) {
    return (
      <Drawer title={`${form.name} added`} onClose={onClose} footer={<button type="button" className="btn-primary h-10" onClick={onClose}>Done</button>}>
        <CredentialsNote username={credentials.username} password={credentials.password} note={credentials.note} />
        <p className="text-sm text-slate-600">The photo is now the student&apos;s profile picture. The identity document stays with the admission, under Edit on the Students page.</p>
      </Drawer>
    );
  }

  return (
    <Drawer
      title={`Review ${source.name}`}
      onClose={onClose}
      footer={
        rejecting ? (
          <>
            <button type="button" className="btn-outline h-10" onClick={() => setRejecting(false)}>Back</button>
            <button type="button" className="btn-primary h-10 bg-red-700 hover:bg-red-800" disabled={busy !== "" || !reason.trim()} onClick={() => void reject()}>
              {busy === "reject" && <Loader2 size={16} className="animate-spin" />} Turn down
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-outline h-10 text-red-700" onClick={() => setRejecting(true)}>
              <X size={16} /> Turn down
            </button>
            <button type="button" className="btn-primary h-10" disabled={busy !== ""} onClick={() => void approve()}>
              {busy === "approve" && <Loader2 size={16} className="animate-spin" />} Approve and add student
            </button>
          </>
        )
      }
    >
      <div className="flex gap-3">
        {admission.hasPhoto ? (
          <a href={file("photo")} target="_blank" rel="noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file("photo")} alt={`${source.name}'s photo`} className="h-28 w-24 rounded-lg border border-slate-200 object-cover" />
          </a>
        ) : (
          <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">No photo</div>
        )}
        <div className="min-w-0 space-y-1 text-sm">
          <div className="text-xs text-slate-500">Filled in {day(admission.submittedAt)}</div>
          {admission.hasIdDocument && (
            <a href={file("idDocument")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold text-brand hover:underline">
              <FileText size={15} /> Identity document ({admission.idDocumentType === "application/pdf" ? "PDF" : "image"}) <ExternalLink size={13} />
            </a>
          )}
          {admission.prefill.note && <div className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">Your note: {admission.prefill.note}</div>}
        </div>
      </div>

      {rejecting ? (
        <Field label="Why? *" hint="For the centre's record. The family is not told automatically.">
          <textarea className="input min-h-[80px]" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      ) : (
        <>
          <p className="text-xs text-slate-500">Correct anything the family got wrong before approving.</p>
          <Field label="Student's name *">
            <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date of birth">
              <input className="input" type="date" value={form.dateOfBirth} onChange={(event) => set({ dateOfBirth: event.target.value })} />
            </Field>
            <Field label="School">
              <input className="input" value={form.school} onChange={(event) => set({ school: event.target.value })} />
            </Field>
            <Field label="Father's name">
              <input className="input" value={form.fatherName} onChange={(event) => set({ fatherName: event.target.value })} />
            </Field>
            <Field label="Mother's name">
              <input className="input" value={form.motherName} onChange={(event) => set({ motherName: event.target.value })} />
            </Field>
            <Field label="Parent to contact">
              <input className="input" value={form.parentName} onChange={(event) => set({ parentName: event.target.value })} />
            </Field>
            <Field label="Phone *">
              <input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} />
            </Field>
            <Field label="Monthly fee (₹)">
              <input className="input" inputMode="decimal" value={form.monthlyFee} onChange={(event) => set({ monthlyFee: event.target.value })} />
            </Field>
          </div>
          <Field label="Address">
            <textarea className="input min-h-[60px]" value={form.address} onChange={(event) => set({ address: event.target.value })} />
          </Field>
          <SlotPicker slots={slots} value={form.slots} onChange={(value) => set({ slots: value })} />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.sendLogin} onChange={(event) => set({ sendLogin: event.target.checked })} />
            Send the login details to the family (WhatsApp + email)
          </label>
        </>
      )}
    </Drawer>
  );
}
