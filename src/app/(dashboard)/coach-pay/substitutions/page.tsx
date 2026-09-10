import Link from "next/link";
import { ArrowLeft, Repeat, UserCheck } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { SubstitutionRateForm } from "@/components/coach-pay/SubstitutionRateForm";
import { RATE_SCOPE_LABELS } from "@/lib/coachPay";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { loadCoachPay, loadProposals } from "@/lib/coachPayData";
import { financialYearLabel, financialYearOptions, resolvePayPeriod } from "@/lib/payPeriods";
import { formatINR } from "@/lib/utils";
import { saveSessionOverride, submitSessionRateProposal, withdrawProposal } from "../actions";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function SubstitutionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  const period = resolvePayPeriod(params);
  const coachScope = viewer.canViewAll ? undefined : viewer.userId;

  const [{ events, overrides }, proposals] = await Promise.all([
    loadCoachPay(period, { coachId: coachScope }),
    loadProposals({ status: "pending", coachId: coachScope }),
  ]);

  const substitutions = events.filter((event) => event.kind === "substitute");
  const sessionProposals = proposals.filter((proposal) => proposal.kind === "session");

  // Grouped by coach so a month can be worked through one person at a time,
  // which is how cover is actually agreed and settled.
  const byCoach = new Map<string, { coachName: string; rows: typeof substitutions }>();
  for (const event of substitutions) {
    const group = byCoach.get(event.coachId) || { coachName: event.coachName, rows: [] as typeof substitutions };
    group.rows.push(event);
    byCoach.set(event.coachId, group);
  }
  const groups = Array.from(byCoach.entries()).sort((a, b) => a[1].coachName.localeCompare(b[1].coachName));

  const totalPaid = substitutions.reduce((sum, event) => sum + event.amount, 0);
  const unpriced = substitutions.filter((event) => event.status === "unpriced").length;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={viewer.canViewAll ? "Payroll workspace" : "My earnings"}
        title={viewer.canViewAll ? "Substitution Classes" : "My Substitution Classes"}
        icon={Repeat}
        subtitle={
          viewer.canViewAll
            ? "Every class taken by a coach it was not assigned to, grouped by who covered it. Rates are typed here because cover is agreed case by case."
            : "Every class you covered for another coach. Enter what was agreed and an admin will approve it before it is paid."
        }
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Substitutions" value={substitutions.length} note={period.label} icon={Repeat} tone="blue" />
          <StatCard label={viewer.canViewAll ? "Substitution cost" : "Your substitution pay"} value={formatINR(totalPaid)} note="Priced and payable" icon={UserCheck} tone="green" />
          <StatCard
            label={viewer.canViewAll ? "Still unpriced" : "Awaiting a rate"}
            value={unpriced}
            note={unpriced ? "Counted as zero until priced" : "All priced"}
            icon={Repeat}
            tone={unpriced ? "rose" : "purple"}
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
        <button type="submit" className="btn-primary h-10 px-5">
          Apply
        </button>
      </form>

      <div className="mt-3">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> Back to coach pay
        </Link>
      </div>

      {groups.length === 0 ? (
        <DataPanel className="mt-3">
          <EmptyState
            title="No substitutions in this period"
            description={
              viewer.canViewAll
                ? "A class appears here once a coach other than the assigned one is recorded as having taken it."
                : "Classes you cover for another coach will appear here."
            }
          />
        </DataPanel>
      ) : (
        <div className="mt-3 grid gap-3">
          {groups.map(([coachId, group]) => {
            const coachTotal = group.rows.reduce((sum, event) => sum + event.amount, 0);
            return (
              <DataPanel
                key={coachId}
                title={group.coachName}
                subtitle={`${group.rows.length} substitution${group.rows.length === 1 ? "" : ""} in ${period.label}`}
                icon={UserCheck}
                action={<span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-bold text-brand">{formatINR(coachTotal)}</span>}
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 font-bold">Date</th>
                        <th className="border-b border-slate-200 px-3 py-2 font-bold">Class</th>
                        <th className="border-b border-slate-200 px-3 py-2 font-bold">Covered for</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Pays</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((event) => {
                        const override = overrides.find(
                          (item: any) =>
                            String(item.classroom) === event.classroomId &&
                            String(item.sessionId) === event.sessionId &&
                            String(item.coach) === event.coachId
                        );
                        const proposal = sessionProposals.find(
                          (item) => item.classroomId === event.classroomId && item.sessionId === event.sessionId && item.coachId === event.coachId
                        );
                        return (
                          <tr key={event.id} className="border-b border-slate-100 align-top last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(event.date)}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-950">{event.classroomTitle}</div>
                              <div className="text-xs text-slate-500">
                                {event.batchName}
                                {event.sessionNumber ? ` - Session ${event.sessionNumber}` : ""}
                                {event.topicName ? ` - ${event.topicName}` : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{event.substitutedForName || "-"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-slate-950">
                              {event.status === "payable" ? formatINR(event.amount) : <span className="text-slate-400">{formatINR(0)}</span>}
                            </td>
                            <td className="px-3 py-2">
                              <SubstitutionRateForm
                                classroomId={event.classroomId}
                                sessionId={event.sessionId}
                                sessionDateIso={new Date(event.date).toISOString()}
                                coachId={event.coachId}
                                minutes={event.minutes}
                                currentAmount={event.rateAmount}
                                currentUnit={event.unit}
                                sourceLabel={event.rateSource === "none" ? "not priced" : RATE_SCOPE_LABELS[event.rateSource]}
                                hasOverride={Boolean(override)}
                                mode={viewer.canManageRates ? "manage" : "propose"}
                                action={viewer.canManageRates ? saveSessionOverride : submitSessionRateProposal}
                                pendingProposal={
                                  proposal ? { id: proposal.id, amount: Number(proposal.amount || 0), unit: proposal.unit, note: proposal.note } : null
                                }
                                withdrawAction={withdrawProposal}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </DataPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
