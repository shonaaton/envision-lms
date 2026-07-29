import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { CreditLedger, FeeAssignment, FeePlan } from "@/models/Fee";
import { AlertTriangle, CheckCircle2, Download, Filter, Search, WalletCards, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { q?: string; filter?: string; plan?: string; min?: string; max?: string };

function value(params: Params, key: keyof Params) {
  return String(params[key] || "");
}

function exportHref(params: Params, format: "csv" | "xls" | "history") {
  const next = new URLSearchParams({
    q: value(params, "q"),
    filter: value(params, "filter") || "all",
    plan: value(params, "plan"),
    min: value(params, "min"),
    max: value(params, "max"),
    format,
  });
  return `/api/fees/credit-monitoring?${next.toString()}`;
}

function statusFor(balance: number) {
  if (balance <= 0) return { label: "Recharge required", tone: "bg-rose-50 text-rose-700 ring-rose-200", icon: XCircle };
  if (balance <= 3) return { label: "Low credit alert", tone: "bg-amber-50 text-amber-700 ring-amber-200", icon: AlertTriangle };
  return { label: "Healthy", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 };
}

function MiniStat({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

export default async function CreditMonitoringPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const params = searchParams ? await searchParams : {};
  const q = value(params, "q").toLowerCase();
  const filter = value(params, "filter") || "all";
  const plan = value(params, "plan");
  const min = value(params, "min");
  const max = value(params, "max");

  const [allAssignments, plans, ledgers] = await Promise.all([
    FeeAssignment.find({ type: "credits" }).populate("student plan").sort({ creditBalance: 1 }).lean(),
    FeePlan.find({ type: "credits" }).sort({ name: 1 }).lean(),
    CreditLedger.find({}).populate("student invoice").sort({ createdAt: -1 }).limit(120).lean(),
  ]);

  const assignments = allAssignments
    .filter((assignment: any) => !q || `${assignment.student?.name || ""} ${assignment.student?.username || ""} ${assignment.student?.email || ""}`.toLowerCase().includes(q))
    .filter((assignment: any) => !plan || assignment.plan?._id?.toString?.() === plan)
    .filter((assignment: any) => filter !== "low" || Number(assignment.creditBalance || 0) <= 3)
    .filter((assignment: any) => filter !== "empty" || Number(assignment.creditBalance || 0) <= 0)
    .filter((assignment: any) => filter !== "healthy" || Number(assignment.creditBalance || 0) > 3)
    .filter((assignment: any) => !min || Number(assignment.creditBalance || 0) >= Number(min))
    .filter((assignment: any) => !max || Number(assignment.creditBalance || 0) <= Number(max));

  const totalStudents = allAssignments.length;
  const lowCount = allAssignments.filter((assignment: any) => Number(assignment.creditBalance || 0) > 0 && Number(assignment.creditBalance || 0) <= 3).length;
  const emptyCount = allAssignments.filter((assignment: any) => Number(assignment.creditBalance || 0) <= 0).length;
  const totalRemaining = allAssignments.reduce((sum: number, assignment: any) => sum + Number(assignment.creditBalance || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-lg border border-brand/10 bg-white p-4 shadow-[0_12px_28px_rgba(90,19,114,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><WalletCards size={21} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand/70">Credit control</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Credit Monitoring</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">Find low balances, export recharge lists, and review recent credit movement.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <MiniStat label="Students" value={totalStudents} note="Credit plans assigned" icon={<WalletCards size={15} />} />
            <MiniStat label="Low" value={lowCount} note="1 to 3 credits" icon={<AlertTriangle size={15} />} />
            <MiniStat label="Empty" value={emptyCount} note="0 credits left" icon={<XCircle size={15} />} />
            <MiniStat label="Remaining" value={totalRemaining} note="Total credits" icon={<CheckCircle2 size={15} />} />
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 xl:grid-cols-[minmax(240px,1.2fr)_180px_200px_120px_120px_260px] xl:items-end">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Search</span>
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input name="q" defaultValue={value(params, "q")} className="input h-10 pl-9" placeholder="Name, student ID, or email" />
            </span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Status</span>
            <select name="filter" defaultValue={filter} className="input h-10">
              <option value="all">All students</option>
              <option value="low">Low credits</option>
              <option value="empty">Zero credits</option>
              <option value="healthy">Healthy</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Plan</span>
            <select name="plan" defaultValue={plan} className="input h-10">
              <option value="">All plans</option>
              {plans.map((item: any) => <option key={item._id.toString()} value={item._id.toString()}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Min</span>
            <input name="min" type="number" min="0" defaultValue={min} className="input h-10" placeholder="0" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Max</span>
            <input name="max" type="number" min="0" defaultValue={max} className="input h-10" placeholder="Any" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary h-10"><Filter size={15} /> Apply</button>
            <a href={exportHref(params, "xls")} className="btn-outline h-10"><Download size={15} /> XLS</a>
            <a href={exportHref(params, "csv")} className="btn-outline h-10"><Download size={15} /> CSV</a>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Students by Credit Balance</h2>
            <p className="mt-1 text-sm text-slate-500">Lowest balances appear first. Use filters to create a recharge list.</p>
          </div>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-black text-brand">{assignments.length} visible</span>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <h3 className="font-black text-slate-950">No matching credit students</h3>
            <p className="mt-1 text-sm text-slate-500">Try clearing search or widening the min/max credit range.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment: any) => {
              const balance = Number(assignment.creditBalance || 0);
              const purchased = Number(assignment.totalCreditsPurchased || 0);
              const consumed = Number(assignment.totalCreditsConsumed || 0);
              const usedPercent = purchased > 0 ? Math.min(100, Math.round((consumed / purchased) * 100)) : 0;
              const status = statusFor(balance);
              const StatusIcon = status.icon;
              return (
                <article key={assignment._id.toString()} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/20 hover:shadow-lg hover:shadow-brand-900/8">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-slate-950">{assignment.student?.name || "Student"}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${status.tone}`}>
                          <StatusIcon size={13} />
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{assignment.student?.username || assignment.student?.email || "-"}</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Plan</div>
                          <div className="mt-1 font-bold text-slate-950">{assignment.plan?.name || "-"}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Purchased</div>
                          <div className="mt-1 font-black text-slate-950">{purchased}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Consumed</div>
                          <div className="mt-1 font-black text-slate-950">{consumed}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Remaining</div>
                          <div className={`mt-1 font-black ${balance <= 3 ? "text-rose-600" : "text-emerald-700"}`}>{balance}</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4">
                      <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>Credit usage</span>
                        <span>{usedPercent}% used</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white">
                        <div className={`h-full rounded-full ${balance <= 3 ? "bg-rose-500" : "bg-brand"}`} style={{ width: `${usedPercent}%` }} />
                      </div>
                      <div className="mt-3 text-sm leading-6 text-slate-600">
                        {balance <= 0 ? "Recharge should be arranged before the next paid class." : balance <= 3 ? "Student is close to needing a recharge." : "Balance is currently healthy."}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Recent Credit Movement</h2>
            <p className="mt-1 text-sm text-slate-500">Recharge, class consumption, and adjustment entries from the ledger.</p>
          </div>
          <a href={exportHref(params, "history")} className="btn-outline h-10"><Download size={15} /> History CSV</a>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {ledgers.map((ledger: any) => {
            const credits = Number(ledger.credits || 0);
            return (
              <div key={ledger._id.toString()} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-950">{ledger.student?.name || "Student"} {credits >= 0 ? "received" : "used"} {Math.abs(credits)} credits</div>
                  <div className="truncate text-xs text-slate-500">{ledger.note || ledger.type}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-black ${credits >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{credits >= 0 ? `+${credits}` : credits}</div>
                  <div className="text-xs text-slate-500">{new Date(ledger.createdAt).toLocaleDateString("en-IN")}</div>
                </div>
              </div>
            );
          })}
          {ledgers.length === 0 && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No credit movement yet.</div>}
        </div>
      </section>
    </div>
  );
}
