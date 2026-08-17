import { dbConnect } from "@/lib/db";
import { getFeaturePermissionState } from "@/lib/featureAccess";
import { isFeesManager } from "@/lib/feesAccess";
import { formatINR } from "@/lib/utils";
import { DeletedInvoice } from "@/models/Fee";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, FileX2, Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function pageNumber(value: string) {
  const parsed = Number(value || 1);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return typeof raw === "string" ? raw : "";
}

function typeLabel(type: string) {
  if (type === "credits") return "Credit Plan";
  if (type === "monthly") return "Monthly Plan";
  return "Manual";
}

function statusTone(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "overdue") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function pageHref(page: number, type: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (type) params.set("type", type);
  return `/fees/deleted-invoices?${params.toString()}`;
}

export default async function DeletedInvoicesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");
  if (!isFeesManager(role)) redirect("/fees");

  const permissions = await getFeaturePermissionState("invoices", session!.user as any, ["view", "edit"]);
  if (!permissions.view) redirect("/fees");

  await dbConnect();
  const params = searchParams ? await searchParams : {};
  const page = pageNumber(queryValue(params, "page"));
  const type = queryValue(params, "type");
  const filter: any = {};
  if (type === "monthly" || type === "credits" || type === "manual") filter.type = type;

  const [records, total] = await Promise.all([
    DeletedInvoice.find(filter)
      .populate("deletedBy", "name username role")
      .sort({ deletedAt: -1, createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    DeletedInvoice.countDocuments(filter),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-700"><FileX2 size={18} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Fees</p>
              <h1 className="text-xl font-bold text-slate-950">Deleted Invoices</h1>
              <p className="mt-1 text-sm text-slate-500">{total} deleted invoice records.</p>
            </div>
          </div>
          <Link href="/fees" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:text-brand">
            <ArrowLeft size={16} /> Fees Dashboard
          </Link>
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ["", "All"],
              ["credits", "Credit"],
              ["monthly", "Monthly"],
              ["manual", "Manual"],
            ].map(([value, label]) => (
              <Link key={value || "all"} href={pageHref(1, value)} className={`rounded-md border px-3 py-2 text-sm font-bold ${type === value ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:text-brand"}`}>
                {label}
              </Link>
            ))}
          </div>
          <div className="text-sm font-semibold text-slate-500">Page {Math.min(page, totalPages)} of {totalPages}</div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-rose-700 shadow-sm"><Receipt size={22} /></div>
            <h2 className="mt-4 text-sm font-bold text-slate-950">No deleted invoices found</h2>
            <p className="mt-1 text-sm text-slate-500">Deleted invoices will appear here with reasons and reversal details.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record: any) => (
              <article key={record._id.toString()} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-950">{record.invoiceNumber || "Deleted invoice"}</h2>
                      <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{typeLabel(record.type)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(record.status || "")}`}>{record.status || "deleted"}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{record.title}</p>
                    <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                      <Info label="Student" value={record.studentName || "-"} note={record.studentUsername || record.studentEmail || ""} />
                      <Info label="Plan" value={record.planName || "-"} note={record.credits ? `${record.credits} credits` : ""} />
                      <Info label="Deleted By" value={record.deletedByName || record.deletedBy?.name || "-"} note={record.deletedByRole || record.deletedBy?.role || ""} />
                    </div>
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Reason</div>
                      <p className="mt-1 text-sm font-semibold text-amber-950">{record.deletionReason}</p>
                    </div>
                    {record.creditReversal?.reversedCredits ? (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                        Reversed {record.creditReversal.reversedCredits} credits. Balance {record.creditReversal.previousBalance} → {record.creditReversal.balanceAfter}.
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    <Info label="Total" value={formatINR(record.totalAmount || 0)} note={record.status === "paid" && record.paidAt ? `Paid ${new Date(record.paidAt).toLocaleDateString("en-IN")}` : ""} />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Info label="Issued" value={record.issueDate ? new Date(record.issueDate).toLocaleDateString("en-IN") : "-"} />
                      <Info label="Due" value={record.dueDate ? new Date(record.dueDate).toLocaleDateString("en-IN") : "-"} />
                    </div>
                    <div className="mt-3">
                      <Info label="Deleted" value={record.deletedAt ? new Date(record.deletedAt).toLocaleString("en-IN") : "-"} />
                    </div>
                    {Array.isArray(record.paymentTransactions) && record.paymentTransactions.length ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Payments</div>
                        <div className="mt-2 space-y-1">
                          {record.paymentTransactions.map((transaction: any, index: number) => (
                            <div key={`${record._id}-${index}`} className="text-xs font-semibold text-slate-700">
                              {formatINR(transaction.amount || 0)} · {transaction.mode === "bank_transfer" ? "Bank Transfer" : String(transaction.mode || "other").toUpperCase()} {transaction.referenceNumber ? `· ${transaction.referenceNumber}` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <Link aria-disabled={page <= 1} href={pageHref(Math.max(1, page - 1), type)} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${page <= 1 ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-200 text-slate-700 hover:text-brand"}`}>
            <ChevronLeft size={16} /> Previous
          </Link>
          <span className="text-sm font-semibold text-slate-500">{records.length ? `${(page - 1) * PAGE_SIZE + 1}-${(page - 1) * PAGE_SIZE + records.length}` : "0"} of {total}</span>
          <Link aria-disabled={page >= totalPages} href={pageHref(Math.min(totalPages, page + 1), type)} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${page >= totalPages ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-200 text-slate-700 hover:text-brand"}`}>
            Next <ChevronRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value, note = "" }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-950">{value}</div>
      {note ? <div className="text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}
