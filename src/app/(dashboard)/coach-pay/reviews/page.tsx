import Link from "next/link";
import { ArrowLeft, CheckCircle2, Gavel, XCircle } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { NoShowRulingDialog } from "@/components/coach-pay/NoShowRulingDialog";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { loadNoShowReviews } from "@/lib/coachPayData";
import { financialYearLabel, financialYearOptions, resolvePayPeriod } from "@/lib/payPeriods";
import { saveNoShowRuling } from "../actions";

export const dynamic = "force-dynamic";

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function NoShowReviewsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer?.canRule) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  const period = resolvePayPeriod(params);
  const show = value(params, "show") || "pending";
  const items = await loadNoShowReviews(period);
  const pending = items.filter((item) => !item.ruling);
  const decided = items.filter((item) => item.ruling);
  const visible = show === "decided" ? decided : show === "all" ? items : pending;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Payroll workspace"
        title="No-Show Rulings"
        icon={Gavel}
        subtitle="Classes the coach turned up for but the student did not, or that failed on a technical problem. Each one needs two answers: is the coach paid, and is the student charged."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Waiting on you" value={pending.length} note={period.label} icon={Gavel} tone="amber" />
          <StatCard label="Already ruled" value={decided.length} note="In this period" icon={CheckCircle2} tone="green" />
          <StatCard
            label="Coach not paid"
            value={decided.filter((item) => !item.ruling?.payCoach).length}
            note="Rulings that withheld pay"
            icon={XCircle}
            tone="rose"
          />
        </div>
      </PageHeader>

      <form method="get" className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[200px_200px_200px_auto]">
        <select name="period" defaultValue={period.preset} className="input h-10" aria-label="Period">
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="month">A specific month</option>
          <option value="fy">Financial year</option>
          <option value="all">All time</option>
        </select>
        <input name="month" type="month" defaultValue={period.month} className="input h-10" aria-label="Month" />
        <select name="fy" defaultValue={String(period.fyStart)} className="input h-10" aria-label="Financial year">
          {financialYearOptions().map((year) => (
            <option key={year} value={year}>
              {financialYearLabel(year)}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <select name="show" defaultValue={show} className="input h-10 w-auto" aria-label="Which rulings to show">
            <option value="pending">Waiting on a ruling</option>
            <option value="decided">Already ruled</option>
            <option value="all">Everything</option>
          </select>
          <button type="submit" className="btn-primary h-10 px-5">
            Apply
          </button>
        </div>
      </form>

      <div className="mt-3">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> Back to coach pay
        </Link>
      </div>

      <DataPanel className="mt-3" title="Missed classes" subtitle={`${visible.length} in ${period.label}`} icon={Gavel}>
        {visible.length === 0 ? (
          <EmptyState
            title={show === "pending" ? "Nothing waiting on a ruling" : "Nothing to show"}
            description={
              show === "pending"
                ? "Every missed class in this period has been decided. Coaches are paid according to those rulings."
                : "Try a wider period or a different filter."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Date</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Class</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Coach</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Students</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Outcome</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Ruling</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={`${item.classroomId}:${item.sessionId}`} className="border-b border-slate-100 align-top last:border-0 hover:bg-brand/[0.03]">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(item.date)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-950">{item.classroomTitle}</div>
                      <div className="text-xs text-slate-500">
                        {item.batchName}
                        {item.sessionNumber ? ` - Session ${item.sessionNumber}` : ""}
                        {item.topicName ? ` - ${item.topicName}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-950">{item.coachName}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {item.students.map((student) => student.name).join(", ") || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                        {item.sessionStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {item.ruling ? (
                        <div className="grid gap-0.5">
                          <span className={item.ruling.payCoach ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>
                            {item.ruling.payCoach ? "Coach paid" : "Coach not paid"}
                          </span>
                          <span className={item.ruling.deductStudentCredit ? "text-rose-700" : "text-slate-600"}>
                            {item.ruling.deductStudentCredit ? "Student charged a credit" : "Student not charged"}
                          </span>
                          {item.ruling.note && <span className="text-slate-500">{item.ruling.note}</span>}
                          {item.ruling.decidedByName && (
                            <span className="text-slate-400">
                              by {item.ruling.decidedByName}
                              {item.ruling.decidedAt ? ` on ${formatDate(item.ruling.decidedAt)}` : ""}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="font-semibold text-amber-700">Not decided - coach unpaid for now</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <NoShowRulingDialog
                        classroomId={item.classroomId}
                        classroomTitle={item.classroomTitle}
                        sessionId={item.sessionId}
                        sessionDate={new Date(item.date).toISOString()}
                        sessionDateLabel={formatDate(item.date)}
                        sessionStatus={item.sessionStatus}
                        sessionLabel={item.sessionNumber ? `Session ${item.sessionNumber}` : item.topicName || "Class"}
                        coachId={item.coachId}
                        coachName={item.coachName}
                        students={item.students}
                        existing={item.ruling ? { payCoach: item.ruling.payCoach, deductStudentCredit: item.ruling.deductStudentCredit, note: item.ruling.note } : null}
                        action={saveNoShowRuling}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>
    </div>
  );
}
