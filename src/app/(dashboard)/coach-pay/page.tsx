import Link from "next/link";
import { AlertTriangle, BadgeIndianRupee, CalendarClock, Gavel, Inbox, Layers, Receipt, Repeat, ScrollText, UserCheck, Users } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { PayPeriodFilter } from "@/components/coach-pay/PayPeriodFilter";
import { SessionRateDialog } from "@/components/coach-pay/SessionRateDialog";
import { PAY_KIND_LABELS, PAY_PLAN_LABELS, PAY_STATUS_LABELS, RATE_SCOPE_LABELS, formatHours, type PayEvent } from "@/lib/coachPay";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { countPendingProposals, loadCoachPay, loadPayOverview, listPayableCoaches } from "@/lib/coachPayData";
import { financialYearOptions, resolvePayPeriod } from "@/lib/payPeriods";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { formatINR } from "@/lib/utils";
import { deleteSessionOverride, saveSessionOverride } from "./actions";

export const dynamic = "force-dynamic";

const MAX_DETAIL_ROWS = 400;

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function statusPill(status: PayEvent["status"]) {
  if (status === "payable") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "pending_review") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "unpriced") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function kindPill(kind: PayEvent["kind"]) {
  if (kind === "substitute") return "bg-sky-50 text-sky-700 ring-sky-200";
  if (kind === "demo") return "bg-violet-50 text-violet-700 ring-violet-200";
  if (kind === "demoConversionBonus") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (kind === "monthly") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function CoachPayPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  const period = resolvePayPeriod(params);
  // A coach's scope is taken from their session, never from the query string,
  // so no amount of URL editing widens what they can see.
  const requestedCoach = value(params, "coach");
  const coachFilter = viewer.canViewAll ? requestedCoach : viewer.userId;
  const batchFilter = value(params, "batch");

  await dbConnect();
  const [{ events, summary, overrides }, coaches, batches, pendingProposals] = await Promise.all([
    loadCoachPay(period, { coachId: coachFilter || undefined, batchId: batchFilter || undefined }),
    viewer.canViewAll ? listPayableCoaches() : Promise.resolve([]),
    Batch.find({}).select("name").sort({ name: 1 }).lean(),
    viewer.canManageRates ? countPendingProposals() : Promise.resolve(0),
  ]);

  const overview = viewer.canViewAll && !coachFilter ? await loadPayOverview(period, summary) : [];
  const selectedName =
    (coaches as any[]).find((coach) => String(coach._id) === coachFilter)?.name || summary.rows[0]?.coachName || "This coach";

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, raw]) => {
    const single = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
    if (single) query.set(key, single);
  });
  const allCoachesQuery = (() => {
    const next = new URLSearchParams(query);
    next.delete("coach");
    return next.toString();
  })();
  // Built here as finished strings rather than handed over as a function: the
  // filter is a client component, and a closure cannot cross that boundary.
  const exportLinks = (["xlsx", "csv", "ods"] as const).map((format) => {
    const next = new URLSearchParams(query);
    next.set("format", format);
    return { format, href: `/api/coach-pay?${next.toString()}` };
  });

  const overrideFor = (event: PayEvent) =>
    overrides.find(
      (item: any) =>
        String(item.classroom) === event.classroomId &&
        String(item.sessionId) === event.sessionId &&
        String(item.coach) === event.coachId
    );

  const detail = events.slice(0, MAX_DETAIL_ROWS);
  const truncated = events.length - detail.length;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={viewer.canViewAll ? "Payroll workspace" : "My earnings"}
        title={viewer.canViewAll ? "All Coach Payments" : "My Teaching Earnings"}
        icon={BadgeIndianRupee}
        subtitle={
          viewer.canViewAll
            ? "What the academy owes its coaches and staff: per class, per hour or a fixed monthly amount, as set in each person's pay plan."
            : "Every class you taught in this period and what it earned, at the rates the academy set for you."
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={viewer.canViewAll ? "Total coach cost" : "Your earnings"}
            value={formatINR(summary.totalAmount)}
            note={period.label}
            icon={BadgeIndianRupee}
            tone="green"
          />
          <StatCard
            label="Classes paid"
            value={summary.payableClasses - summary.demoClasses}
            note={`${summary.demoClasses ? `+ ${summary.demoClasses} demo${summary.demoClasses === 1 ? "" : "s"} - ` : ""}${formatHours(summary.rows.reduce((sum, row) => sum + row.minutes, 0))} teaching hours`}
            icon={CalendarClock}
            tone="blue"
          />
          <StatCard
            label={viewer.canViewAll ? "Coaches paid" : "Conversion bonuses"}
            value={viewer.canViewAll ? summary.coachCount : summary.rows[0]?.conversionBonuses || 0}
            note={viewer.canViewAll ? "With at least one payable class" : formatINR(summary.bonusAmount)}
            icon={viewer.canViewAll ? Users : UserCheck}
            tone="purple"
          />
          <StatCard
            label="Awaiting a ruling"
            value={summary.pendingReview}
            note={`${formatINR(summary.pendingAmount)} not yet counted`}
            icon={Gavel}
            tone="amber"
          />
        </div>
      </PageHeader>

      <div className="mt-3 flex flex-wrap gap-2">
        {!viewer.canViewAll && (
          <Link href="/staff-invoices" className="btn-primary h-9 px-4 text-xs">
            <Receipt size={14} /> Create my invoice
          </Link>
        )}
        <Link href="/coach-pay/rates" className="btn-outline h-9 px-4 text-xs">
          <Layers size={14} /> {viewer.canManageRates ? "Pay plans and rates" : "My pay rates"}
        </Link>
        <Link href="/coach-pay/substitutions" className="btn-outline h-9 px-4 text-xs">
          <Repeat size={14} /> {viewer.canViewAll ? "Substitutions" : "My substitutions"}
        </Link>
        {viewer.canManageRates && (
          <Link href="/coach-pay/proposals" className="btn-outline h-9 px-4 text-xs">
            <Inbox size={14} /> Coach submissions
            {pendingProposals > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{pendingProposals}</span>
            )}
          </Link>
        )}
        {viewer.canRule && (
          <Link href="/coach-pay/reviews" className="btn-outline h-9 px-4 text-xs">
            <Gavel size={14} /> No-show rulings
            {summary.pendingReview > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                {summary.pendingReview}
              </span>
            )}
          </Link>
        )}
      </div>

      <div className="mt-3">
        <PayPeriodFilter
          preset={period.preset}
          month={period.month}
          from={period.fromInput}
          to={period.toInput}
          fyStart={period.fyStart}
          fyOptions={financialYearOptions()}
          coaches={(coaches as any[]).map((coach) => ({ id: String(coach._id), name: coach.name || coach.username || "Coach" }))}
          batches={(batches as any[]).map((batch) => ({ id: String(batch._id), name: batch.name }))}
          selectedCoach={requestedCoach}
          selectedBatch={batchFilter}
          exportLinks={exportLinks}
          canExport={viewer.canExport}
          showCoachFilter={viewer.canViewAll}
        />
      </div>

      {summary.unpriced > 0 && !viewer.canViewAll && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-bold">{summary.unpriced} of your classes have no rate from the academy yet</span>, so they
            count as zero below and your invoice waits for them. Please ask an admin to set the rate.
          </p>
        </div>
      )}

      {viewer.canViewAll && coachFilter && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/20 bg-white p-3 text-sm">
          <div>
            Showing <span className="font-bold">{selectedName}</span>&apos;s classes for {period.label}.
            {summary.unpriced > 0 && (
              <span className="ml-2 font-semibold text-rose-700">
                {summary.unpriced} {summary.unpriced === 1 ? "class has" : "classes have"} no rate - their invoice is on hold.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {viewer.canManageRates && (
              <Link href={`/coach-pay/rates?coach=${coachFilter}`} className="btn-primary h-9 px-4 text-xs">
                <Layers size={14} /> Set pay
              </Link>
            )}
            <Link href={`/coach-pay?${allCoachesQuery}`} className="btn-outline h-9 px-4 text-xs">
              <Users size={14} /> All coaches
            </Link>
          </div>
        </div>
      )}

      {viewer.canViewAll && !coachFilter && (
        <DataPanel className="mt-3" title="All coach payments" subtitle={`${period.label} - pick a coach to see their classes`} icon={Users}>
          {overview.length === 0 ? (
            <EmptyState title="No coaches yet" description="Coaches and paid staff appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 font-bold">Coach</th>
                    <th className="border-b border-slate-200 px-3 py-2 font-bold">Pay plan</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Classes</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Hours</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Earned</th>
                    <th className="border-b border-slate-200 px-3 py-2 font-bold">Needs attention</th>
                    <th className="border-b border-slate-200 px-3 py-2 font-bold">Invoice</th>
                    <th className="border-b border-slate-200 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {overview.map((row) => (
                    <tr key={row.coachId} className="border-b border-slate-100 align-top last:border-0 hover:bg-brand/[0.03]">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-950">{row.name}</div>
                        <div className="text-xs text-slate-500">
                          {row.role === "instructor" ? "Coach" : row.role === "sub-admin" ? "Sub-admin" : "Admin"}
                          {row.isActive ? "" : " - inactive"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {row.plan ? (
                          <>
                            <div className="font-semibold text-slate-950">{PAY_PLAN_LABELS[row.plan.type]}</div>
                            <div className="text-xs text-slate-500">{row.plan.detail}</div>
                          </>
                        ) : (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">No plan</span>
                        )}
                        {row.upcoming && (
                          <div className="mt-1 rounded-md bg-sky-50 px-2 py-1 text-[11px] font-semibold leading-4 text-sky-800">
                            From {row.upcoming.startsLabel}: {PAY_PLAN_LABELS[row.upcoming.type]} - {row.upcoming.detail}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.classes || "-"}
                        {row.demoClasses > 0 && <div className="text-xs text-slate-500">+ {row.demoClasses} demo{row.demoClasses === 1 ? "" : "s"}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{row.minutes ? formatHours(row.minutes) : "-"}</td>
                      <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-950">{formatINR(row.earned)}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.unpriced > 0 && <div className="font-bold text-rose-700">{row.unpriced} without a rate</div>}
                        {row.pendingReview > 0 && <div className="font-semibold text-amber-700">{row.pendingReview} awaiting a no-show ruling</div>}
                        {!row.plan && <div className="text-slate-500">{row.upcoming ? `No plan for this month - theirs starts ${row.upcoming.startsLabel}` : "Set how they are paid"}</div>}
                        {row.unpriced === 0 && row.pendingReview === 0 && row.plan && <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!period.month ? (
                          <span className="text-slate-400">Pick a month</span>
                        ) : row.invoice ? (
                          <a href={`/api/staff-invoices/${row.invoice.id}/pdf`} className="font-semibold text-brand underline">
                            {row.invoice.number} - {row.invoice.status === "paid" ? "Paid" : "Submitted"}
                          </a>
                        ) : (
                          <span className="text-slate-500">Not yet</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link href={`/coach-pay?${new URLSearchParams({ ...Object.fromEntries(query), coach: row.coachId }).toString()}`} className="btn-outline h-8 px-3 text-xs">
                            Classes
                          </Link>
                          {viewer.canManageRates && (
                            <Link href={`/coach-pay/rates?coach=${row.coachId}`} className="btn-primary h-8 px-3 text-xs">
                              Set pay
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2 text-sm font-bold text-slate-950" colSpan={4}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right text-base font-black tabular-nums text-slate-950">{formatINR(summary.totalAmount)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DataPanel>
      )}

      {(!viewer.canViewAll || coachFilter) && (
      <DataPanel
        className="mt-3"
        title="Class by class"
        subtitle={`${events.length} lines in ${period.label}${truncated > 0 ? ` - showing the most recent ${MAX_DETAIL_ROWS}` : ""}`}
        icon={ScrollText}
      >
        {detail.length === 0 ? (
          <EmptyState
            title="No classes in this period"
            description="Try a wider period, or clear the batch and coach filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Date</th>
                  {viewer.canViewAll && <th className="border-b border-slate-200 px-3 py-2 font-bold">Coach</th>}
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Class</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Type</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Priced from</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Rate</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Amount</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Status</th>
                  {viewer.canManageRates && <th className="border-b border-slate-200 px-3 py-2 font-bold" />}
                </tr>
              </thead>
              <tbody>
                {detail.map((event) => {
                  const override = overrideFor(event);
                  return (
                    <tr key={event.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-brand/[0.03]">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(event.date)}</td>
                      {viewer.canViewAll && <td className="px-3 py-2 font-semibold text-slate-950">{event.coachName}</td>}
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-950">{event.classroomTitle}</div>
                        <div className="text-xs text-slate-500">
                          {event.batchName}
                          {event.level ? ` - ${event.level} level` : ""}
                          {event.sessionNumber ? ` - Session ${event.sessionNumber}` : ""}
                          {event.topicName ? ` - ${event.topicName}` : ""}
                        </div>
                        {event.isSubstitution && event.substitutedForName && (
                          <div className="mt-0.5 text-xs font-medium text-sky-700">Covering for {event.substitutedForName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${kindPill(event.kind)}`}>
                          {PAY_KIND_LABELS[event.kind]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {event.rateSource === "none" ? "-" : RATE_SCOPE_LABELS[event.rateSource]}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">
                        {event.rateAmount ? (
                          <>
                            {formatINR(event.rateAmount)}
                            <span className="block text-xs text-slate-400">
                              {event.kind === "monthly" ? "per month" : event.unit === "per_hour" ? `per hour - ${event.minutes}m` : "per class"}
                            </span>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-slate-950">
                        {event.coveredByMonthly ? (
                          <span className="text-xs font-normal text-slate-500">In monthly pay</span>
                        ) : event.status === "payable" ? (
                          formatINR(event.amount)
                        ) : (
                          <span className="text-slate-400">{formatINR(0)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${statusPill(event.status)}`}>
                          {PAY_STATUS_LABELS[event.status]}
                        </span>
                        {event.status === "pending_review" && (
                          <div className="mt-0.5 text-xs text-amber-700">worth {formatINR(event.exposure)}</div>
                        )}
                      </td>
                      {viewer.canManageRates && (
                        <td className="px-3 py-2">
                          {event.sessionId && !event.coveredByMonthly && (
                            <SessionRateDialog
                              classroomId={event.classroomId}
                              sessionId={event.sessionId}
                              coachId={event.coachId}
                              coachName={event.coachName}
                              classroomTitle={event.classroomTitle}
                              sessionLabel={event.sessionNumber ? `Session ${event.sessionNumber}` : event.topicName || "Class"}
                              sessionDate={formatDate(event.date)}
                              kind={event.kind}
                              currentAmount={event.rateAmount}
                              currentUnit={event.unit}
                              currentSource={event.rateSource === "none" ? "nothing yet" : RATE_SCOPE_LABELS[event.rateSource]}
                              hasOverride={Boolean(override)}
                              overrideId={override ? String(override._id) : ""}
                              minutes={event.minutes}
                              saveAction={saveSessionOverride}
                              clearAction={deleteSessionOverride}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>
      )}
    </div>
  );
}
