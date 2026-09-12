import Link from "next/link";
import { AlertTriangle, BadgeIndianRupee, CalendarClock, Gavel, Inbox, Layers, Repeat, ScrollText, UserCheck, Users } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { PayPeriodFilter } from "@/components/coach-pay/PayPeriodFilter";
import { SessionRateDialog } from "@/components/coach-pay/SessionRateDialog";
import { PAY_KIND_LABELS, PAY_STATUS_LABELS, RATE_SCOPE_LABELS, type PayEvent } from "@/lib/coachPay";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { countPendingProposals, loadCoachPay, listPayableCoaches } from "@/lib/coachPayData";
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

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, raw]) => {
    const single = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
    if (single) query.set(key, single);
  });
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
        title={viewer.canViewAll ? "Coach Pay" : "My Teaching Earnings"}
        icon={BadgeIndianRupee}
        subtitle={
          viewer.canViewAll
            ? "What the academy owes its coaches for the classes they actually taught, priced from the rate cards."
            : "Every class you taught in this period and what it earned, priced from the rates the academy set for your batches."
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
            value={summary.payableClasses}
            note={`${Math.round(summary.rows.reduce((sum, row) => sum + row.minutes, 0) / 60)} teaching hours`}
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
        <Link href="/coach-pay/rates" className="btn-outline h-9 px-4 text-xs">
          <Layers size={14} /> {viewer.canManageRates ? "Rate cards" : "My class rates"}
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

      {summary.unpriced > 0 && viewer.canViewAll && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-bold">{summary.unpriced} classes have no rate.</span> They are shown below as &quot;No rate
            set&quot; and are counted as zero, not guessed at.{" "}
            {viewer.canManageRates && (
              <Link href="/coach-pay/rates" className="font-bold underline">
                Add a rate card
              </Link>
            )}{" "}
            covering them, or price them one class at a time.
          </p>
        </div>
      )}

      {viewer.canViewAll && (
        <DataPanel className="mt-3" title="Cost by coach" subtitle={period.label} icon={Users}>
          {summary.rows.length === 0 ? (
            <EmptyState title="Nothing to pay in this period" description="No classes were taught in the selected window, or none of them are priced yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 font-bold">Coach</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Regular</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Demo</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Substitution</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Conversion bonus</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Hours</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Awaiting ruling</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr key={row.coachId} className="border-b border-slate-100 last:border-0 hover:bg-brand/[0.03]">
                      <td className="px-3 py-2">
                        <Link href={`/coach-pay?${new URLSearchParams({ ...Object.fromEntries(query), coach: row.coachId }).toString()}`} className="font-semibold text-slate-950 hover:text-brand hover:underline">
                          {row.coachName}
                        </Link>
                        {row.unpriced > 0 && (
                          <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                            {row.unpriced} unpriced
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatINR(row.regularAmount)}
                        <span className="ml-1 text-xs text-slate-400">({row.regularClasses})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatINR(row.demoAmount)}
                        <span className="ml-1 text-xs text-slate-400">({row.demoClasses})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatINR(row.substitutionAmount)}
                        <span className="ml-1 text-xs text-slate-400">({row.substitutionClasses})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatINR(row.bonusAmount)}
                        <span className="ml-1 text-xs text-slate-400">({row.conversionBonuses})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{(row.minutes / 60).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                        {row.pendingReview ? `${formatINR(row.pendingAmount)} (${row.pendingReview})` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-950">{formatINR(row.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2 text-sm font-bold text-slate-950">Total</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(summary.regularAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(summary.demoAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(summary.substitutionAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(summary.bonusAmount)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-700">{formatINR(summary.pendingAmount)}</td>
                    <td className="px-3 py-2 text-right text-base font-black tabular-nums text-slate-950">{formatINR(summary.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DataPanel>
      )}

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
                            <span className="block text-xs text-slate-400">{event.unit === "per_hour" ? `per hour - ${event.minutes}m` : "per class"}</span>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-slate-950">
                        {event.status === "payable" ? formatINR(event.amount) : <span className="text-slate-400">{formatINR(0)}</span>}
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
                          {event.sessionId && (
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
    </div>
  );
}
