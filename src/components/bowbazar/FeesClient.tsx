"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { monthKey, monthLabel, reminderText, shiftMonth } from "@/lib/branch/rules";
import { whatsAppChatLink } from "@/lib/branch/admissionRules";
import { ChargeDrawer, CollectDrawer, ReceiptShare, type ReceiptShareInfo } from "./FeeExtras";
import { cn } from "@/lib/utils";
import { BranchHeader, Drawer, Field, Stat, api, rupees } from "./shared";

type Payment = { id: string; amount: number; mode: string; paidAt: string; reference: string; note: string; collectedByName: string; receiptNo: string };
type Receipt = ReceiptShareInfo;
type Bill = {
  id: string;
  month: string;
  amount: number;
  discount: number;
  lateFee: number;
  admissionFee: number;
  planDiscount: number;
  charges: { id: string; label: string; kind: string; amount: number; note: string; addedByName: string }[];
  due: number;
  paidAmount: number;
  balance: number;
  status: "unpaid" | "partial" | "paid" | "waived";
  waivedReason: string;
  note: string;
  payments: Payment[];
  student: { id: string; name: string; phone: string; parentName: string; status: string; slots: { id: string; label: string }[] } | null;
};
type Report = {
  month: string;
  bills: Bill[];
  totals: {
    billed: number;
    collected: number;
    pending: number;
    paidCount: number;
    pendingCount: number;
    received: { cash: number; upi: number; bank: number; other: number };
    receivedTotal: number;
  };
};
type PendingGroup = { student: Bill["student"]; bills: Bill[]; balance: number };

const STATUS_STYLE: Record<Bill["status"], string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-900",
  unpaid: "bg-red-100 text-red-800",
  waived: "bg-slate-200 text-slate-700",
};
const STATUS_LABEL: Record<Bill["status"], string> = { paid: "Paid", partial: "Part paid", unpaid: "Pending", waived: "Waived" };
const MODE_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank", other: "Old record" };

export default function FeesClient({ can }: { can: string[] }) {
  const current = monthKey();
  const [tab, setTab] = useState<"month" | "pending">("month");
  const [month, setMonth] = useState(current);
  const [report, setReport] = useState<Report | null>(null);
  const [pending, setPending] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<Bill | null>(null);
  const [adjusting, setAdjusting] = useState<Bill | null>(null);
  const [collecting, setCollecting] = useState<PendingGroup | null>(null);
  const [charging, setCharging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [monthData, pendingData] = await Promise.all([
        api<Report>(`/api/bowbazar/fees?month=${month}`),
        api<{ students: PendingGroup[] }>("/api/bowbazar/fees/pending"),
      ]);
      setReport(monthData);
      setPending(pendingData.students);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(() => Array.from({ length: 18 }, (_, index) => shiftMonth(current, -index)), [current]);
  const q = query.trim().toLowerCase();
  const matches = (bill: Bill) => !q || [bill.student?.name, bill.student?.parentName, bill.student?.phone].some((value) => value?.toLowerCase().includes(q));
  const rows = (report?.bills || []).filter((bill) => {
    if (filter === "pending" && bill.balance <= 0) return false;
    if (filter === "paid" && bill.balance > 0) return false;
    return matches(bill);
  });
  const pendingRows = pending.filter((group) => !q || [group.student?.name, group.student?.parentName, group.student?.phone].some((value) => value?.toLowerCase().includes(q)));
  const totalArrears = pending.reduce((sum, group) => sum + group.balance, 0);

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Fees"
        subtitle="Monthly fees, non-GST. Bills for active students are raised on the 1st."
        can={can}
        actions={
          <>
            <button type="button" className="btn-primary h-10" onClick={() => setCharging(true)}>
              <Plus size={16} /> Add a charge
            </button>
            <a className="btn-outline h-10" href={`/api/bowbazar/fees/export?month=${month}&format=xlsx`}>
              <Download size={16} /> Excel
            </a>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-brand/10 bg-white p-1">
          {(["month", "pending"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-bold", tab === value ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-50")}
            >
              {value === "month" ? "Monthly report" : `Who owes (${pending.length})`}
            </button>
          ))}
        </div>
        {tab === "month" && (
          <select className="input w-48" value={month} onChange={(event) => setMonth(event.target.value)}>
            {months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
          </select>
        )}
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search student, parent or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      {tab === "month" && report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Billed" value={rupees(report.totals.billed)} hint={`${report.bills.length} students`} />
            <Stat label="Collected" value={rupees(report.totals.collected)} tone="good" hint={`${report.totals.paidCount} paid in full`} />
            <Stat label="Pending" value={rupees(report.totals.pending)} tone={report.totals.pending ? "bad" : "good"} hint={`${report.totals.pendingCount} students`} />
            <Stat
              label={`Received in ${monthLabel(month).split(" ")[0]}`}
              value={rupees(report.totals.receivedTotal)}
              hint={`Cash ${rupees(report.totals.received.cash)} · UPI ${rupees(report.totals.received.upi)} · Bank ${rupees(report.totals.received.bank)}${report.totals.received.other ? ` · Old records ${rupees(report.totals.received.other)}` : ""}`}
            />
          </div>

          <div className="flex gap-1 text-sm">
            {(["all", "pending", "paid"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn("rounded-full px-3 py-1 font-bold capitalize", filter === value ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}
              >
                {value}
              </button>
            ))}
          </div>

          <section className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Student</th>
                  <th className="px-4 py-2">Slots</th>
                  <th className="px-4 py-2 text-right">Due</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && <tr><td colSpan={7} className="px-4 py-5 text-slate-500">Loading...</td></tr>}
                {!loading && !rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No bills for {monthLabel(month)}.</td></tr>}
                {rows.map((bill) => (
                  <tr key={bill.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-950">{bill.student?.name}</div>
                      <div className="text-xs text-slate-500">{[bill.student?.parentName, bill.student?.phone].filter(Boolean).join(" · ")}</div>
                      {bill.student?.status === "inactive" && <div className="text-xs font-bold text-slate-500">Inactive</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{bill.student?.slots.map((slot) => slot.label).join(", ")}</td>
                    <td className="px-4 py-3 text-right">
                      {rupees(bill.due)}
                      {(bill.discount > 0 || bill.planDiscount > 0 || bill.lateFee > 0 || bill.admissionFee > 0 || bill.charges.length > 0) && (
                        <div className="text-[11px] text-slate-500">
                          {bill.discount > 0 && `−${rupees(bill.discount)} `}
                          {bill.planDiscount > 0 && `−${rupees(bill.planDiscount)} plan `}
                          {bill.charges.map((charge) => `+${rupees(charge.amount)} ${charge.label} `)}
                          {bill.lateFee > 0 && `+${rupees(bill.lateFee)} late `}
                          {bill.admissionFee > 0 && `+${rupees(bill.admissionFee)} admission`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rupees(bill.paidAmount)}
                      {bill.payments.length > 0 && (
                        <div className="text-[11px] text-slate-500">
                          {bill.payments.map((payment) => `${MODE_LABEL[payment.mode]} ${new Date(payment.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className={cn("px-4 py-3 text-right font-bold", bill.balance ? "text-red-700" : "text-slate-400")}>{rupees(bill.balance)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_STYLE[bill.status])}>{STATUS_LABEL[bill.status]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {bill.balance > 0 && (
                          <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => setPaying(bill)}>Record payment</button>
                        )}
                        <button type="button" className="btn-outline h-8 px-3 text-xs" onClick={() => setAdjusting(bill)}>Details</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {tab === "pending" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Families owing" value={pending.length} tone={pending.length ? "warn" : "good"} />
            <Stat label="Total pending" value={rupees(totalArrears)} tone={totalArrears ? "bad" : "good"} />
            <Stat label="Owing 2+ months" value={pending.filter((group) => group.bills.length > 1).length} tone="bad" />
          </div>
          <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
            {!loading && !pendingRows.length && <div className="p-8 text-center text-sm text-slate-500">Nobody owes anything.</div>}
            <div className="divide-y divide-slate-100">
              {pendingRows.map((group) => (
                <article key={group.student?.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-950">{group.student?.name}</span>
                      {group.student?.status === "inactive" && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Inactive</span>}
                    </div>
                    <div className="text-xs text-slate-500">{[group.student?.parentName, group.student?.phone].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {group.bills.map((bill) => (
                        <button
                          key={bill.id}
                          type="button"
                          onClick={() => setPaying(bill)}
                          className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-800 hover:bg-red-100"
                          title="Record payment"
                        >
                          {monthLabel(bill.month)} · {rupees(bill.balance)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 md:text-right">
                    {group.student?.phone && (
                      <a
                        className="btn-outline h-9 px-3 text-xs"
                        target="_blank"
                        rel="noreferrer"
                        title="Open WhatsApp with a reminder ready to send"
                        href={whatsAppChatLink(
                          group.student.phone,
                          `Hello${group.student.parentName ? ` ${group.student.parentName}` : ""}, ${reminderText({
                            studentName: group.student.name,
                            balance: group.balance,
                            months: group.bills.map((bill) => bill.month),
                            branchLabel: "Bowbazar",
                          })}\n- Envision Chess Academy`
                        )}
                      >
                        <MessageCircle size={14} /> Remind
                      </a>
                    )}
                    {group.student && group.bills.length > 1 && (
                      <button type="button" className="btn-outline h-9 px-3 text-xs" onClick={() => setCollecting(group)} title="Pay several months on one receipt">
                        Collect
                      </button>
                    )}
                    <div>
                      <div className="text-lg font-black text-red-700">{rupees(group.balance)}</div>
                      <div className="text-xs text-slate-500">{group.bills.length} month{group.bills.length > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {paying && <PayDrawer bill={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); void load(); }} />}
      {adjusting && <BillDrawer bill={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); void load(); }} />}
      {collecting?.student && (
        <CollectDrawer
          student={collecting.student}
          bills={collecting.bills}
          onClose={() => setCollecting(null)}
          onDone={() => { setCollecting(null); void load(); }}
        />
      )}
      {charging && <ChargeDrawer onClose={() => setCharging(false)} onDone={() => { setCharging(false); void load(); }} />}
    </div>
  );
}

function PayDrawer({ bill, onClose, onDone }: { bill: Bill; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ amount: String(bill.balance / 100), mode: "cash", paidAt: new Date().toISOString().slice(0, 10), reference: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ receipt: Receipt }>(`/api/bowbazar/fees/${bill.id}`, { method: "PATCH", json: { action: "pay", ...form } });
      toast.success(`Payment recorded for ${bill.student?.name}.`);
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
      title={`${bill.student?.name} · ${monthLabel(bill.month)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" onClick={save} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} Record payment
          </button>
        </>
      }
    >
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        Due {rupees(bill.due)} · paid {rupees(bill.paidAmount)} · <span className="font-bold text-red-700">balance {rupees(bill.balance)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)" hint="Less than the balance records a part payment.">
          <input className="input" inputMode="decimal" value={form.amount} onChange={(event) => set({ amount: event.target.value })} />
        </Field>
        <Field label="Received on">
          <input type="date" className="input" value={form.paidAt} onChange={(event) => set({ paidAt: event.target.value })} />
        </Field>
      </div>
      <Field label="Paid by">
        <div className="flex gap-2">
          {(["cash", "upi", "bank"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set({ mode })}
              className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-bold", form.mode === mode ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700")}
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>
      </Field>
      {form.mode !== "cash" && (
        <Field label="UPI / transaction reference">
          <input className="input" value={form.reference} onChange={(event) => set({ reference: event.target.value })} />
        </Field>
      )}
      <Field label="Note">
        <input className="input" value={form.note} onChange={(event) => set({ note: event.target.value })} />
      </Field>
    </Drawer>
  );
}

function BillDrawer({ bill, onClose, onDone }: { bill: Bill; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    amount: String(bill.amount / 100),
    discount: String(bill.discount / 100),
    lateFee: String(bill.lateFee / 100),
    admissionFee: String((bill.admissionFee || 0) / 100),
    note: bill.note,
  });
  const [waiveReason, setWaiveReason] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function send(json: Record<string, unknown>, message: string) {
    setSaving(true);
    try {
      await api(`/api/bowbazar/fees/${bill.id}`, { method: "PATCH", json });
      toast.success(message);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={`${bill.student?.name} · ${monthLabel(bill.month)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => send({ action: "adjust", ...form }, "Bill updated.")}>
            {saving && <Loader2 size={16} className="animate-spin" />} Save changes
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fee (₹)">
          <input className="input" inputMode="decimal" value={form.amount} onChange={(event) => set({ amount: event.target.value })} />
        </Field>
        <Field label="Discount (₹)">
          <input className="input" inputMode="decimal" value={form.discount} onChange={(event) => set({ discount: event.target.value })} />
        </Field>
        <Field label="Late fee (₹)">
          <input className="input" inputMode="decimal" value={form.lateFee} onChange={(event) => set({ lateFee: event.target.value })} />
        </Field>
        <Field label="Admission fee (₹)">
          <input className="input" inputMode="decimal" value={form.admissionFee} onChange={(event) => set({ admissionFee: event.target.value })} />
        </Field>
      </div>
      <Field label="Note">
        <input className="input" value={form.note} onChange={(event) => set({ note: event.target.value })} />
      </Field>

      {bill.charges.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold text-slate-600">Charges</div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {bill.charges.map((charge) => (
              <li key={charge.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-bold">{rupees(charge.amount)}</span> · {charge.label}
                  <div className="text-xs text-slate-500">{[charge.note, charge.addedByName && `added by ${charge.addedByName}`].filter(Boolean).join(" · ")}</div>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                  aria-label={`Remove ${charge.label}`}
                  disabled={saving}
                  onClick={() => window.confirm(`Remove ${charge.label} from this bill?`) && send({ action: "removeCharge", chargeId: charge.id }, "Charge removed.")}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-1 text-xs font-bold text-slate-600">Payments</div>
        {!bill.payments.length && <div className="text-sm text-slate-500">None yet.</div>}
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {bill.payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <span className="font-bold">{rupees(payment.amount)}</span> · {MODE_LABEL[payment.mode]} · {new Date(payment.paidAt).toLocaleDateString("en-IN")}
                {payment.receiptNo && (
                  <a href={`/bowbazar/receipts/${payment.id}`} target="_blank" rel="noreferrer" className="ml-2 font-mono text-xs font-bold text-brand hover:underline">
                    {payment.receiptNo}
                  </a>
                )}
                <div className="text-xs text-slate-500">{[payment.reference, payment.note, payment.collectedByName && `by ${payment.collectedByName}`].filter(Boolean).join(" · ")}</div>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                aria-label="Remove payment"
                disabled={saving}
                onClick={() => window.confirm("Remove this payment? Use this only for a mistaken entry.") && send({ action: "removePayment", paymentId: payment.id }, "Payment removed.")}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        {bill.status === "waived" ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Waived: {bill.waivedReason}</span>
            <button type="button" className="btn-outline h-8 px-3 text-xs" disabled={saving} onClick={() => send({ action: "adjust", waive: false }, "Bill restored.")}>Undo waive</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-600">Waive this month</div>
            <div className="flex gap-2">
              <input className="input" placeholder="Reason, e.g. absent all month" value={waiveReason} onChange={(event) => setWaiveReason(event.target.value)} />
              <button type="button" className="btn-outline h-10 shrink-0" disabled={saving || !waiveReason.trim()} onClick={() => send({ action: "adjust", waive: true, reason: waiveReason }, "Bill waived.")}>
                Waive
              </button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
