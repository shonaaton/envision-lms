import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { CreditLedger, FeeAssignment } from "@/models/Fee";
import "@/models/User";
import { ArrowDownCircle, ArrowUpCircle, FileText, Receipt, WalletCards } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessFeature } from "@/lib/featureAccess";
import { isFeesManager } from "@/lib/feesAccess";

export const dynamic = "force-dynamic";

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function transactionLabel(type: string, credits: number) {
  if (type === "purchase") return "Credits Added";
  if (type === "attendance_consumption") return "Class Credit Used";
  if (credits > 0) return "Credit Added";
  if (credits < 0) return "Credit Deducted";
  return "Credit Adjustment";
}

function transactionTone(credits: number) {
  return credits >= 0
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : "border-rose-100 bg-rose-50 text-rose-700";
}

function StatCard({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_14px_36px_rgba(90,19,114,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/10 text-brand">
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function RelatedInvoice({ invoice }: { invoice: any }) {
  if (!invoice?._id) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-800">{invoice.invoiceNumber || "Invoice"}</span>
      <a
        href={`/api/fees/invoices/${invoice._id}/pdf`}
        target="_blank"
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand/15 bg-white px-2.5 text-xs font-bold text-brand hover:bg-brand hover:text-white"
      >
        <FileText size={13} /> PDF
      </a>
    </div>
  );
}

export default async function CreditHistoryPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");
  if (!(await canAccessFeature("fees", session!.user as any, "view"))) redirect("/dashboard");
  const manager = isFeesManager(role);

  await dbConnect();

  const ledgerFilter = manager ? {} : { student: userId };
  const [ledgers, assignment] = await Promise.all([
    CreditLedger.find(ledgerFilter)
      .populate("student", "name username email")
      .populate("invoice", "invoiceNumber totalAmount status type title")
      .sort({ createdAt: -1 })
      .limit(manager ? 500 : 300)
      .lean(),
    manager ? null : FeeAssignment.findOne({ student: userId, type: "credits" }).populate("plan").lean(),
  ]);

  const added = ledgers.filter((item: any) => Number(item.credits || 0) > 0).reduce((sum: number, item: any) => sum + Number(item.credits || 0), 0);
  const deducted = ledgers.filter((item: any) => Number(item.credits || 0) < 0).reduce((sum: number, item: any) => sum + Math.abs(Number(item.credits || 0)), 0);
  const currentBalance = manager ? "-" : Number((assignment as any)?.creditBalance || 0);

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#fffdf2_0%,#fbf6ff_45%,#ffffff_100%)] px-3 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-4 rounded-[26px] border border-brand/10 bg-white p-4 shadow-[0_22px_60px_rgba(90,19,114,0.12)] sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand/70">Credit History</p>
            <h1 className="mt-1 text-2xl font-black text-brand sm:text-3xl">Credit Usage History</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              See every credit added, deducted, and the balance after each transaction.
            </p>
          </div>
          <Link
            href="/fees"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-brand/15 bg-white px-4 text-sm font-bold text-brand hover:bg-brand hover:text-white"
          >
            <WalletCards size={16} /> Billing Overview
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Current Balance" value={currentBalance} note={manager ? "Management view" : "Credits available"} icon={WalletCards} />
        <StatCard label="Credits Added" value={`+${added}`} note="All recharge and adjustment credits" icon={ArrowUpCircle} />
        <StatCard label="Credits Deducted" value={`-${deducted}`} note="Classes and deductions" icon={ArrowDownCircle} />
        <StatCard label="Transactions" value={ledgers.length} note="Complete credit ledger" icon={Receipt} />
      </div>

      <section className="rounded-[26px] border border-brand/10 bg-white p-3 shadow-[0_18px_45px_rgba(90,19,114,0.10)] sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">All Credit Transactions</h2>
            <p className="text-sm text-slate-500">Credits are deducted after attendance is marked present or late.</p>
          </div>
          <span className="w-fit rounded-full bg-brand/10 px-3 py-1 text-xs font-black text-brand">{ledgers.length} entries</span>
        </div>

        {ledgers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <h3 className="text-lg font-black text-slate-950">No credit history yet</h3>
            <p className="mt-1 text-sm text-slate-500">Credit purchases and class deductions will appear here.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    {manager && <th className="px-4 py-3">Student</th>}
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Transaction Type</th>
                    <th className="px-4 py-3">Credits Added</th>
                    <th className="px-4 py-3">Credits Deducted</th>
                    <th className="px-4 py-3">Balance After</th>
                    <th className="px-4 py-3">Description / Reason</th>
                    <th className="px-4 py-3">Related Invoice / Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgers.map((item: any) => {
                    const credits = Number(item.credits || 0);
                    return (
                      <tr key={item._id.toString()} className="border-t border-slate-100 align-top">
                        {manager && (
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-950">{item.student?.name || "Student"}</div>
                            <div className="text-xs text-slate-500">{item.student?.username || item.student?.email || "-"}</div>
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(item.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${transactionTone(credits)}`}>
                            {transactionLabel(item.type, credits)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-black text-emerald-700">{credits > 0 ? `+${credits}` : "-"}</td>
                        <td className="px-4 py-3 font-black text-rose-700">{credits < 0 ? credits : "-"}</td>
                        <td className="px-4 py-3 font-black text-slate-950">{item.balanceAfter}</td>
                        <td className="min-w-64 px-4 py-3 text-slate-600">{item.note || "Credit ledger transaction"}</td>
                        <td className="min-w-44 px-4 py-3"><RelatedInvoice invoice={item.invoice} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {ledgers.map((item: any) => {
                const credits = Number(item.credits || 0);
                return (
                  <article key={item._id.toString()} className="rounded-3xl border border-brand/10 bg-[#fbf7ff] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-slate-950">{transactionLabel(item.type, credits)}</p>
                        {manager && <p className="mt-0.5 text-xs font-semibold text-slate-500">{item.student?.name || "Student"}</p>}
                        <p className="mt-1 text-sm text-slate-500">{item.note || "Credit ledger transaction"}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatDate(item.createdAt)}</p>
                      </div>
                      <span className={`shrink-0 rounded-2xl px-3 py-2 text-lg font-black ${credits >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {credits > 0 ? `+${credits}` : credits}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-2xl bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Added</p>
                        <p className="mt-1 font-black text-emerald-700">{credits > 0 ? `+${credits}` : "-"}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Deducted</p>
                        <p className="mt-1 font-black text-rose-700">{credits < 0 ? credits : "-"}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Balance</p>
                        <p className="mt-1 font-black text-slate-950">{item.balanceAfter}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Invoice</p>
                        <div className="mt-1 text-xs"><RelatedInvoice invoice={item.invoice} /></div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
