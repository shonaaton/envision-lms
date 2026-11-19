import Link from "next/link";
import { ArrowLeft, CheckCircle2, Gift, IndianRupee, UserX } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { CoachNoShowRulingDialog } from "@/components/coach-pay/CoachNoShowRulingDialog";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { loadCoachNoShowReviews } from "@/lib/coachPayData";
import { financialYearLabel, financialYearOptions, resolvePayPeriod } from "@/lib/payPeriods";
import { saveCoachNoShowRuling } from "./actions";

export const dynamic = "force-dynamic";

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function rupees(paise: number) {
  return `Rs ${(Math.round(paise) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default async function CoachNoShowsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer?.canRuleCoachNoShow) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  const period = resolvePayPeriod(params);
  const show = value(params, "show") || "pending";
  const items = await loadCoachNoShowReviews(period);
  const pending = items.filter((item) => !item.ruling);
  const decided = items.filter((item) => item.ruling);
  const visible = show === "decided" ? decided : show === "all" ? items : pending;
  const fines = decided.reduce((sum, item) => sum + (item.ruling?.chargeFine ? item.ruling.fineAmount : 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Payroll workspace"
        title="Coach No-Shows"
        icon={UserX}
        subtitle="Classes the coach did not take. The missed class is never paid or charged. For each one, decide whether to fine the coach and whether the next class is free for the family - which also means the coach is not paid for it."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Waiting on you" value={pending.length} note={period.label} icon={UserX} tone="amber" />
          <StatCard label="Already ruled" value={decided.length} note="In this period" icon={CheckCircle2} tone="green" />
          <StatCard label="Fines" value={rupees(fines)} note="Deducted from coach pay" icon={IndianRupee} tone="rose" />
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
          <select name="show" defaultValue={show} className="input h-10 w-auto" aria-label="Which classes to show">
            <option value="pending">Waiting on a ruling</option>
            <option value="decided">Already ruled</option>
            <option value="all">Everything</option>
          </select>
          <button type="submit" className="btn-primary h-10 px-5">
            Apply
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> Back to coach pay
        </Link>
        <span className="text-xs text-slate-500">
          A class only shows here once its outcome is Coach no-show. If it was left unmarked, set its outcome to Coach no-show on the classroom page first.
        </span>
      </div>

      <DataPanel className="mt-3" title="Classes the coach missed" subtitle={`${visible.length} in ${period.label}`} icon={UserX}>
        {visible.length === 0 ? (
          <EmptyState
            title={show === "pending" ? "Nothing waiting on a ruling" : "Nothing to show"}
            description={show === "pending" ? "Every coach no-show in this period has been ruled on." : "Try a wider period or a different filter."}
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
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Ruling</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={`${item.classroomId}:${item.sessionId}`} className="border-b border-slate-100 align-top last:border-0 hover:bg-brand/[0.03]">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(item.date)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/classrooms/${item.classroomId}`} className="font-medium text-slate-950 hover:underline">
                        {item.classroomTitle}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {item.batchName}
                        {item.sessionNumber ? ` - Session ${item.sessionNumber}` : ""}
                        {item.topicName ? ` - ${item.topicName}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-950">{item.coachName}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{item.students.map((student) => student.name).join(", ") || "-"}</td>
                    <td className="px-3 py-2 text-xs">
                      {item.ruling ? (
                        <div className="grid gap-0.5">
                          <span className={item.ruling.chargeFine ? "font-bold text-rose-700" : "font-bold text-slate-700"}>
                            {item.ruling.chargeFine ? `Fine ${rupees(item.ruling.fineAmount)}` : "No fine"}
                          </span>
                          {item.ruling.freeNextClass ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <Gift size={12} />
                              {item.freeClass
                                ? `Free class: ${formatDate(item.freeClass.date)} (coach unpaid)`
                                : "Next class free - not taught yet"}
                              {item.ruling.credited ? ` - ${item.ruling.credited} credit${item.ruling.credited === 1 ? "" : "s"} given` : ""}
                            </span>
                          ) : (
                            <span className="text-slate-600">Next class charged as usual</span>
                          )}
                          <span className="text-slate-500">{item.ruling.familiesNotifiedAt ? "Family messaged" : "Family not messaged"}</span>
                          {item.ruling.note && <span className="text-slate-500">{item.ruling.note}</span>}
                          {item.ruling.decidedByName && (
                            <span className="text-slate-400">
                              by {item.ruling.decidedByName}
                              {item.ruling.decidedAt ? ` on ${formatDate(item.ruling.decidedAt)}` : ""}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="font-semibold text-amber-700">Not decided</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CoachNoShowRulingDialog
                        classroomId={item.classroomId}
                        classroomTitle={item.classroomTitle}
                        sessionId={item.sessionId}
                        sessionDateLabel={formatDate(item.date)}
                        sessionLabel={item.sessionNumber ? `Session ${item.sessionNumber}` : item.topicName || "Class"}
                        coachName={item.coachName}
                        students={item.students}
                        classValue={item.classValue}
                        existing={
                          item.ruling
                            ? {
                                chargeFine: item.ruling.chargeFine,
                                fineAmount: item.ruling.fineAmount,
                                freeNextClass: item.ruling.freeNextClass,
                                note: item.ruling.note,
                                familiesNotified: Boolean(item.ruling.familiesNotifiedAt),
                              }
                            : null
                        }
                        action={saveCoachNoShowRuling}
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
