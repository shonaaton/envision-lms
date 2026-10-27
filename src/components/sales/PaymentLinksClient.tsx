"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Copy, Link2, Loader2, Plus, Search, Send, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Field, Modal } from "@/components/common/Modal";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { cn, formatINR } from "@/lib/utils";

type LinkRow = {
  id: string;
  customerName: string;
  studentName: string;
  phone: string;
  countryCode: string;
  email: string;
  feePlanName: string;
  amount: number;
  description: string;
  createdByName: string;
  shortUrl: string;
  status: "created" | "paid" | "cancelled" | "expired";
  paidAt: string | null;
  amountPaid: number;
  method: string;
  whatsappStatus: "" | "sent" | "failed" | "not_configured";
  attachedStudentName: string;
  attachedInvoiceNumber: string;
  createdAt: string;
};

type Plan = { id: string; name: string; type: string; credits: number; total: number };
type Permissions = Partial<Record<"view" | "create" | "cancel" | "attach", boolean>>;
type Student = { id: string; name: string; email: string; phone: string; accountStatus: string };

const statusStyle: Record<LinkRow["status"], string> = {
  created: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-600",
  expired: "bg-slate-100 text-slate-600",
};

const statusLabel: Record<LinkRow["status"], string> = {
  created: "Awaiting payment",
  paid: "Paid",
  cancelled: "Cancelled",
  expired: "Expired",
};

const whatsappLabel: Record<string, string> = {
  sent: "WhatsApp sent",
  failed: "WhatsApp failed - copy the link",
  not_configured: "WhatsApp not sent - copy the link",
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Something went wrong.");
  return data;
}

function when(value?: string | null) {
  return value ? formatAcademyDateTime(value, { weekday: undefined }) : "-";
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  } catch {
    toast.error("Could not copy. Select the link and copy it instead.");
  }
}

const emptyForm = { customerName: "", studentName: "", phone: "", countryCode: "+91", email: "", feePlanId: "", amountRupees: "", description: "" };

function CreateLinkModal({ plans, onClose, onCreated }: { plans: Plan[]; onClose: () => void; onCreated: (link: LinkRow) => void }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const plan = plans.find((item) => item.id === form.feePlanId);
  const total = plan ? plan.total : Math.round(Number(form.amountRupees || 0) * 100);
  const set = (key: keyof typeof emptyForm) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await readJson(await fetch("/api/sales/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amountRupees: form.feePlanId ? undefined : Number(form.amountRupees || 0) }),
      }));
      onCreated(data.link);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New payment link" subtitle="Razorpay makes a link for this exact amount and the academy WhatsApp sends it to the parent." onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Parent name">
            <input className="input" value={form.customerName} onChange={set("customerName")} required />
          </Field>
          <Field label="Student name" hint="Optional">
            <input className="input" value={form.studentName} onChange={set("studentName")} />
          </Field>
          <Field label="WhatsApp number">
            <div className="flex gap-2">
              <input className="input w-20" value={form.countryCode} onChange={set("countryCode")} aria-label="Country code" />
              <input className="input min-w-0 flex-1" value={form.phone} onChange={set("phone")} inputMode="tel" required />
            </div>
          </Field>
          <Field label="Email" hint="Optional; Razorpay sends the receipt here">
            <input className="input" type="email" value={form.email} onChange={set("email")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fee plan" hint="Pick a plan, or leave it on custom amount">
            <select className="input" value={form.feePlanId} onChange={set("feePlanId")}>
              <option value="">Custom amount</option>
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {formatINR(item.total)}
                </option>
              ))}
            </select>
          </Field>
          {form.feePlanId ? (
            <Field label="Amount" hint="From the plan, GST included">
              <div className="input flex items-center bg-slate-50 font-bold">{formatINR(total)}</div>
            </Field>
          ) : (
            <Field label="Amount (₹)" hint="What the family pays, GST included">
              <input className="input" type="number" min="1" step="0.01" value={form.amountRupees} onChange={set("amountRupees")} required />
            </Field>
          )}
        </div>
        <Field label="What it is for" hint={plan ? `Leave empty to use "${plan.name}"` : "Shown to the parent, e.g. Group classes, 8 sessions"}>
          <input className="input" value={form.description} onChange={set("description")} maxLength={200} required={!plan} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            Parent pays <span className="font-black text-slate-950">{total >= 100 ? formatINR(total) : "-"}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || total < 100}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Create and send
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function AttachModal({ link, onClose, onAttached }: { link: LinkRow; onClose: () => void; onAttached: (link: LinkRow) => void }) {
  const [query, setQuery] = useState(link.studentName || link.customerName);
  const [students, setStudents] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState("");

  const search = useCallback(async (value: string) => {
    if (value.trim().length < 2) return setStudents([]);
    setSearching(true);
    try {
      const data = await readJson(await fetch(`/api/sales/payment-links/students?q=${encodeURIComponent(value.trim())}`, { cache: "no-store" }));
      setStudents(data.students || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  async function attach(studentId: string) {
    setSaving(studentId);
    try {
      const data = await readJson(await fetch(`/api/sales/payment-links/${link.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attach", studentId }),
      }));
      onAttached(data.link);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving("");
    }
  }

  return (
    <Modal title="Attach payment to a student" subtitle={`${link.customerName} paid ${formatINR(link.amountPaid || link.amount)}. This raises a paid invoice on the student's account; no message is sent to the family.`} onClose={onClose}>
      <label className="relative block">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student name, parent name, email or phone" autoFocus />
      </label>
      <div className="mt-3 space-y-2">
        {searching && <p className="text-sm text-slate-500"><Loader2 size={14} className="mr-1 inline animate-spin" /> Searching</p>}
        {!searching && query.trim().length >= 2 && !students.length && <p className="text-sm text-slate-500">No students match. Convert the demo account first, then attach.</p>}
        {students.map((student) => (
          <div key={student.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-950">{student.name}</p>
              <p className="truncate text-xs text-slate-500">{[student.email, student.phone, student.accountStatus].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" className="btn-primary shrink-0" disabled={Boolean(saving)} onClick={() => attach(student.id)}>
              {saving === student.id ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />} Attach
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function PaymentLinksClient() {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [attaching, setAttaching] = useState<LinkRow | null>(null);
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<"all" | LinkRow["status"]>("all");

  const load = useCallback(async () => {
    try {
      const data = await readJson(await fetch("/api/sales/payment-links", { cache: "no-store" }));
      setLinks(data.links || []);
      setPlans(data.plans || []);
      setPermissions(data.permissions || {});
      setConfigured(data.configured !== false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (link: LinkRow) => setLinks((current) => current.map((item) => (item.id === link.id ? link : item)));

  async function act(link: LinkRow, action: "resend" | "cancel") {
    if (action === "cancel" && !window.confirm(`Cancel the ${formatINR(link.amount)} link for ${link.customerName}? The parent will no longer be able to pay with it.`)) return;
    setBusy(`${link.id}:${action}`);
    try {
      const data = await readJson(await fetch(`/api/sales/payment-links/${link.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }));
      replace(data.link);
      if (action === "cancel") toast.success("Link cancelled.");
      else toast[data.link.whatsappStatus === "sent" ? "success" : "warning"](whatsappLabel[data.link.whatsappStatus] || "Sent.");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  const totals = useMemo(() => {
    const paid = links.filter((link) => link.status === "paid");
    return {
      open: links.filter((link) => link.status === "created").length,
      paid: paid.length,
      collected: paid.reduce((sum, link) => sum + (link.amountPaid || link.amount), 0),
      unattached: paid.filter((link) => !link.attachedInvoiceNumber).length,
    };
  }, [links]);
  const visible = filter === "all" ? links : links.filter((link) => link.status === filter);

  return (
    <div className="space-y-5 p-2 text-slate-950">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Link2 size={14} /> Payment Links
          </div>
          <h1 className="mt-2 text-3xl font-black text-brand">Payment Links</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Send a new family a Razorpay link for the exact fee. The link is marked paid here the moment they pay{permissions.attach ? ", and you then attach it to their student account" : ""}.
          </p>
        </div>
        {permissions.create && (
          <button type="button" className="btn-primary h-10 shrink-0" onClick={() => setCreating(true)} disabled={!configured}>
            <Plus size={16} /> New payment link
          </button>
        )}
      </header>

      {!configured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Razorpay is not configured on the server yet, so links cannot be created.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Awaiting payment", value: String(totals.open) },
          { label: "Paid", value: String(totals.paid) },
          { label: "Collected", value: formatINR(totals.collected) },
          ...(permissions.attach ? [{ label: "Paid, not attached", value: String(totals.unattached) }] : []),
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "created", "paid", "cancelled", "expired"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn("rounded-full px-3 py-1 text-xs font-bold", filter === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
          >
            {value === "all" ? "All" : statusLabel[value]}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-slate-500"><Loader2 size={14} className="mr-1 inline animate-spin" /> Loading</p>
        ) : !visible.length ? (
          <p className="p-6 text-sm text-slate-500">No payment links yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((link) => (
              <li key={link.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-950">{link.customerName}</p>
                    {link.studentName && <span className="text-sm text-slate-500">for {link.studentName}</span>}
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", statusStyle[link.status])}>{statusLabel[link.status]}</span>
                  </div>
                  <p className="text-sm text-slate-700">
                    <span className="font-bold">{formatINR(link.amount)}</span> · {link.description}
                  </p>
                  <p className="text-xs text-slate-500">
                    {link.countryCode} {link.phone} · Sent {when(link.createdAt)}{link.createdByName ? ` by ${link.createdByName}` : ""}
                  </p>
                  {link.status === "created" && link.whatsappStatus && (
                    <p className={cn("text-xs font-bold", link.whatsappStatus === "sent" ? "text-emerald-700" : "text-amber-700")}>{whatsappLabel[link.whatsappStatus]}</p>
                  )}
                  {link.status === "paid" && (
                    <p className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={13} /> Paid {when(link.paidAt)}{link.method ? ` by ${link.method.toUpperCase()}` : ""}
                      {link.attachedInvoiceNumber ? ` · ${link.attachedInvoiceNumber} for ${link.attachedStudentName}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {link.status === "created" && link.shortUrl && (
                    <button type="button" className="btn-outline" onClick={() => copyLink(link.shortUrl)}>
                      <Copy size={15} /> Copy link
                    </button>
                  )}
                  {link.status === "created" && permissions.create && (
                    <button type="button" className="btn-outline" disabled={Boolean(busy)} onClick={() => act(link, "resend")}>
                      {busy === `${link.id}:resend` ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Resend
                    </button>
                  )}
                  {link.status === "created" && permissions.cancel && (
                    <button type="button" className="btn-ghost text-red-600" disabled={Boolean(busy)} onClick={() => act(link, "cancel")}>
                      {busy === `${link.id}:cancel` ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Cancel
                    </button>
                  )}
                  {link.status === "paid" && !link.attachedInvoiceNumber && permissions.attach && (
                    <button type="button" className="btn-primary" onClick={() => setAttaching(link)}>
                      <UserCheck size={15} /> Attach to student
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <CreateLinkModal
          plans={plans}
          onClose={() => setCreating(false)}
          onCreated={(link) => {
            setCreating(false);
            setLinks((current) => [link, ...current]);
            toast[link.whatsappStatus === "sent" ? "success" : "warning"](
              link.whatsappStatus === "sent" ? "Link created and sent on WhatsApp." : "Link created, but WhatsApp did not send it. Copy the link and share it."
            );
          }}
        />
      )}
      {attaching && (
        <AttachModal
          link={attaching}
          onClose={() => setAttaching(null)}
          onAttached={(link) => {
            setAttaching(null);
            replace(link);
            toast.success(`Attached as ${link.attachedInvoiceNumber}.`);
          }}
        />
      )}
    </div>
  );
}
