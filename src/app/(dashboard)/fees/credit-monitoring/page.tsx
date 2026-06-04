import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { CreditLedger, FeeAssignment } from "@/models/Fee";
import { Search, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CreditMonitoringPage({ searchParams }: { searchParams: { q?: string; filter?: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const q = (searchParams.q || "").toLowerCase();
  const filter = searchParams.filter || "all";
  let assignments: any[] = await FeeAssignment.find({ type: "credits" }).populate("student plan").sort({ creditBalance: 1 }).lean();
  if (q) assignments = assignments.filter((a) => `${a.student?.name} ${a.student?.username} ${a.student?.email}`.toLowerCase().includes(q));
  if (filter === "low") assignments = assignments.filter((a) => a.creditBalance <= 3);
  if (filter === "empty") assignments = assignments.filter((a) => a.creditBalance <= 0);
  const ledgers = await CreditLedger.find({ type: "purchase" }).populate("student invoice").sort({ createdAt: -1 }).limit(80).lean();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><WalletCards size={18} /></span>
        <div><h1 className="text-2xl font-semibold">Credit Monitoring</h1><p className="text-sm text-slate-500">Lowest remaining credits are shown first so recharges are easy to identify.</p></div>
      </div>

      <form className="mb-4 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input name="q" defaultValue={searchParams.q} className="h-10 rounded-md border pl-9 pr-3 text-sm" placeholder="Search students..." />
        </label>
        <select name="filter" defaultValue={filter} className="h-10 rounded-md border px-3 text-sm">
          <option value="all">All credit students</option>
          <option value="low">Low credits</option>
          <option value="empty">Zero credits</option>
        </select>
        <button className="rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">Apply</button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Student</th><th>Plan</th><th>Purchased</th><th>Consumed</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>
              {assignments.map((a: any) => (
                <tr key={a._id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{a.student?.name}<div className="text-xs text-slate-500">{a.student?.username}</div></td>
                  <td>{a.plan?.name}</td>
                  <td>{a.totalCreditsPurchased}</td>
                  <td>{a.totalCreditsConsumed}</td>
                  <td className={a.creditBalance <= 3 ? "font-semibold text-rose-600" : "font-semibold text-emerald-700"}>{a.creditBalance}</td>
                  <td>{a.creditBalance <= 0 ? "Recharge required" : a.creditBalance <= 3 ? "Low credit alert" : "Healthy"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Recharge History</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ledgers.map((l: any) => (
            <div key={l._id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span>{l.student?.name} purchased {l.credits} credits</span>
              <span className="text-xs text-slate-500">{new Date(l.createdAt).toLocaleDateString("en-IN")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
