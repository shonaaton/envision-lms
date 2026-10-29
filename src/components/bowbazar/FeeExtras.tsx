"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, MessageCircle, Receipt as ReceiptIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { monthKey, monthLabel } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { Drawer, Field, api, rupees } from "./shared";

export type ReceiptShareInfo = { paymentId: string; receiptNo: string; whatsappLink: string; message: string; hasEmail: boolean };

/** After a payment: open the receipt, or send it on WhatsApp. */
export function ReceiptShare({ receipt, onDone }: { receipt: ReceiptShareInfo; onDone: () => void }) {
  return (
    <Drawer title={`Receipt ${receipt.receiptNo}`} onClose={onDone} footer={<button type="button" className="btn-primary h-10" onClick={onDone}>Done</button>}>
      <p className="text-sm text-slate-600">
        {receipt.hasEmail ? "The receipt has been emailed to the family." : "The family has no email address, so send the receipt on WhatsApp."}
      </p>
      <div className="flex flex-wrap gap-2">
        {receipt.whatsappLink && (
          <a href={receipt.whatsappLink} target="_blank" rel="noreferrer" className="btn-primary h-10 px-4">
            <MessageCircle size={16} /> Send on WhatsApp
          </a>
        )}
        <a href={`/bowbazar/receipts/${receipt.paymentId}`} target="_blank" rel="noreferrer" className="btn-outline h-10 px-4">
          <ReceiptIcon size={16} /> Open receipt
        </a>
        <button
          type="button"
          className="btn-outline h-10 px-4"
          onClick={() => {
            void navigator.clipboard?.writeText(receipt.message);
            toast.success("Copied.");
          }}
        >
          <Copy size={16} /> Copy message
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{receipt.message}</pre>
    </Drawer>
  );
}

type OwedBill = { id: string; month: string; balance: number };

/** Collects several of a family's months in one go, on one receipt. */
export function CollectDrawer({
  student,
  bills,
  onClose,
  onDone,
}: {
  student: { id: string; name: string };
  bills: OwedBill[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(bills.map((bill) => bill.id));
  const [form, setForm] = useState({ mode: "cash", paidAt: new Date().toISOString().slice(0, 10), reference: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptShareInfo | null>(null);
  const total = bills.filter((bill) => picked.includes(bill.id)).reduce((sum, bill) => sum + bill.balance, 0);

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ receipt: ReceiptShareInfo }>("/api/bowbazar/fees/collect", { method: "POST", json: { studentId: student.id, billIds: picked, ...form } });
      toast.success(`${rupees(total)} recorded for ${student.name}.`);
      setReceipt(data.receipt);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (receipt) return <ReceiptShare receipt={receipt} onDone={onDone} />;

  return (
    <Drawer
      title={`Collect from ${student.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving || !picked.length} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Record {rupees(total)}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">Each ticked month is paid in full, on one receipt.</p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
        {bills.map((bill) => (
          <li key={bill.id}>
            <label className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={picked.includes(bill.id)}
                  onChange={(event) => setPicked((current) => (event.target.checked ? [...current, bill.id] : current.filter((value) => value !== bill.id)))}
                />
                {monthLabel(bill.month)}
              </span>
              <span className="font-bold text-slate-800">{rupees(bill.balance)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Paid by">
          <select className="input" value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank transfer</option>
          </select>
        </Field>
        <Field label="Received on">
          <input type="date" className="input" value={form.paidAt} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} />
        </Field>
      </div>
      {form.mode !== "cash" && (
        <Field label="UPI / transaction reference">
          <input className="input" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} />
        </Field>
      )}
      <Field label="Note">
        <input className="input" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </Field>
    </Drawer>
  );
}

type StudentPick = { id: string; name: string; status: string; slots: { id: string; label: string }[] };

const KINDS = [
  { value: "tournament", label: "Tournament entry" },
  { value: "material", label: "Books / chess set" },
  { value: "exam", label: "Exam / certificate" },
  { value: "event", label: "Event / camp" },
  { value: "other", label: "Other" },
];

/** Adds a one-off charge to one or many students' bills - a tournament entry for the whole Saturday class, say. */
export function ChargeDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [students, setStudents] = useState<StudentPick[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ label: "", kind: "tournament", amount: "", month: monthKey(), note: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ students: StudentPick[] }>("/api/bowbazar/students")
      .then((data) => setStudents(data.students))
      .catch((error) => toast.error(error.message));
  }, []);

  const slots = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of students || []) for (const slot of student.slots) map.set(slot.id, slot.label);
    return [...map.entries()];
  }, [students]);
  const shown = (students || []).filter((student) => student.status === "active" && student.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ added: number; month: string }>("/api/bowbazar/fees/charges", { method: "POST", json: { ...form, studentIds: picked } });
      toast.success(`Added to ${data.added} ${data.added === 1 ? "bill" : "bills"} for ${monthLabel(data.month)}.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title="Add a charge"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving || !picked.length} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Add to {picked.length} {picked.length === 1 ? "student" : "students"}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">A one-off amount on top of the month&apos;s fee. It shows on the family&apos;s bill, in reminders and on the receipt.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What for *">
          <input className="input" value={form.label} placeholder="e.g. Diwali Rapid entry" onChange={(event) => setForm({ ...form, label: event.target.value })} />
        </Field>
        <Field label="Type">
          <select className="input" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            {KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹) *">
          <input className="input" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        </Field>
        <Field label="On the bill for">
          <input type="month" className="input" value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} />
        </Field>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-600">Students ({picked.length} picked)</span>
          <span className="flex flex-wrap gap-1">
            <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold" onClick={() => setPicked(shown.map((student) => student.id))}>
              All shown
            </button>
            <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold" onClick={() => setPicked([])}>
              None
            </button>
            <select
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold"
              value=""
              onChange={(event) => {
                const slotId = event.target.value;
                const inSlot = (students || []).filter((student) => student.status === "active" && student.slots.some((slot) => slot.id === slotId)).map((student) => student.id);
                setPicked((current) => [...new Set([...current, ...inSlot])]);
              }}
            >
              <option value="">Add a whole class...</option>
              {slots.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </span>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students" />
        </div>
        {!students ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100">
            {shown.map((student) => (
              <label key={student.id} className={cn("flex cursor-pointer items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-sm", picked.includes(student.id) && "bg-brand-50")}>
                <input
                  type="checkbox"
                  checked={picked.includes(student.id)}
                  onChange={(event) => setPicked((current) => (event.target.checked ? [...current, student.id] : current.filter((value) => value !== student.id)))}
                />
                <span className="font-semibold">{student.name}</span>
                <span className="text-xs text-slate-400">{student.slots.map((slot) => slot.label).join(", ")}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <Field label="Note">
        <input className="input" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </Field>
    </Drawer>
  );
}
