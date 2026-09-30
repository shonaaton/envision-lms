import Link from "next/link";
import { ArrowLeft, GraduationCap, Layers, Repeat, UserCog } from "lucide-react";

import { DataPanel, EmptyState, PageHeader } from "@/components/common/PageHeader";
import { BatchRateGrid, type BatchRateRow } from "@/components/coach-pay/BatchRateGrid";
import { PAY_PLAN_LABELS } from "@/lib/coachPay";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { listPayableCoaches, loadCoachBatchRates, loadCoachPayPlans, type CoachBatchRateRow, type PayPlanRow } from "@/lib/coachPayData";
import { PayPlanForm, type PayPlanFormPlan } from "@/components/coach-pay/PayPlanForm";
import { academyMonthOf, monthLabel } from "@/lib/feedback/feedbackCycleDates";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { CoachRate } from "@/models/CoachPay";
import { deleteCoachPayPlan, saveBatchRate, saveCoachPayPlan } from "../actions";

export const dynamic = "force-dynamic";

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

export default async function CoachRatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  await dbConnect();

  // A coach sees their own rates, read-only: the academy sets every rate.
  if (!viewer.canManageRates) {
    const [rows, { current }] = await Promise.all([loadCoachBatchRates(viewer.userId), loadCoachPayPlans(viewer.userId)]);
    const planType: keyof typeof PAY_PLAN_LABELS = current?.type || "per_class";
    const planItems: Array<[string, string]> = !current
      ? []
      : planType === "monthly"
        ? [["Fixed monthly amount", formatINR(current.monthlyAmount || 0)], ["Demos, substitutions, conversions", "Included in the monthly amount"]]
        : [
            ...(planType === "per_hour"
              ? ([["Hourly rate (regular and substitution classes)", current.hourlyRate === null ? "Not set yet" : `${formatINR(current.hourlyRate)} per hour`]] as Array<[string, string]>)
              : []),
            ["Demo class", current.demoRate === null ? "Not set yet" : `${formatINR(current.demoRate)} per demo`],
            ...(planType === "per_class"
              ? ([["Substitution class", current.substituteRate === null ? "Not set yet" : `${formatINR(current.substituteRate)} per class`]] as Array<[string, string]>)
              : []),
            ["Demo conversion incentive", current.conversionBonus === null ? "Not set yet" : `${formatINR(current.conversionBonus)} per enrolment`],
          ];
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="My earnings"
          title="My Pay Rates"
          icon={Layers}
          subtitle="How the academy pays you and the rate for each of your batches. Rates are set by the academy - if something looks wrong, please speak to an admin."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
            <ArrowLeft size={14} /> Back to my earnings
          </Link>
          <Link href="/coach-pay/substitutions" className="btn-outline h-9 px-4 text-xs">
            <Repeat size={14} /> My substitutions
          </Link>
        </div>
        <DataPanel className="mt-3" title={`My pay plan: ${PAY_PLAN_LABELS[planType]}`} icon={GraduationCap}>
          {planItems.length ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {planItems.map(([label, amount]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
                  <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                  <dd className="mt-0.5 font-bold tabular-nums text-slate-950">{amount}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-600">You are paid per class at each batch&apos;s rate below.</p>
          )}
        </DataPanel>
        {planType !== "monthly" && (
          <DataPanel
            className="mt-3"
            title={planType === "per_hour" ? "My batches" : "My batch rates"}
            subtitle={planType === "per_hour" ? "Paid at your hourly rate" : "What each regular class pays"}
            icon={Layers}
          >
            {rows.length === 0 ? (
              <EmptyState title="No batches assigned" description="Batches you are assigned to appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 font-bold">Batch</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.batchId || row.classroomId} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-950">
                            {row.title}
                            {row.isActive ? "" : <span className="ml-1 text-xs font-normal text-slate-500">(closed)</span>}
                          </div>
                          {row.courses.length > 0 && (
                            <div className="mt-0.5 text-xs text-slate-600">{row.courses.join("  →  ")}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {planType === "per_hour" ? (
                            <span className="text-slate-600">Hourly rate</span>
                          ) : row.current ? (
                            <>
                              {formatINR(row.current.amount)}
                              <span className="ml-1 text-xs text-slate-400">{row.current.unit === "per_hour" ? "/hr" : "/class"}</span>
                            </>
                          ) : (
                            <span className="font-semibold text-rose-700">Not set yet</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataPanel>
        )}
      </div>
    );
  }

  const coaches = (await listPayableCoaches()) as any[];
  const selectedCoach = value(params, "coach");
  const selected = coaches.find((coach) => String(coach._id) === selectedCoach);
  const coachName = selected?.name || selected?.username || "This coach";

  const [batchRates, planState] = selected
    ? await Promise.all([loadCoachBatchRates(selectedCoach), loadCoachPayPlans(selectedCoach)])
    : [[], { plans: [], current: null }];

  const toFormPlan = (plan: PayPlanRow): PayPlanFormPlan => {
    const month = academyMonthOf(plan.effectiveFrom);
    return { ...plan, month, monthLabel: monthLabel(month) };
  };

  const now = new Date();
  const batchRows: BatchRateRow[] = (batchRates as CoachBatchRateRow[]).map((row) => ({
    batchId: row.batchId,
    classroomId: row.classroomId,
    title: row.title,
    courses: row.courses,
    isActive: row.isActive,
    current: row.current ? row.current.amount : null,
    history: row.history,
  }));

  const planType = planState.current?.type || null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Payroll workspace"
        title="Set Coach Pay"
        icon={Layers}
        subtitle="Choose a coach, choose how they are paid - per class, per hour or a fixed monthly amount - and set the amounts. Coaches see what they earn but cannot change it."
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> All coach payments
        </Link>
      </div>

      <DataPanel className="mt-3" title="Coach" icon={UserCog}>
        <form method="get" className="flex flex-wrap gap-2">
          <select name="coach" defaultValue={selectedCoach} className="input h-10 w-auto min-w-[260px]" aria-label="Coach" required>
            <option value="" disabled>
              Choose a coach or staff member...
            </option>
            {coaches.map((coach) => (
              <option key={String(coach._id)} value={String(coach._id)}>
                {coach.name || coach.username}
                {coach.role !== "instructor" ? ` (${coach.role})` : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary h-10 px-5">
            Open
          </button>
        </form>
      </DataPanel>

      {!selected ? (
        <DataPanel className="mt-3">
          <EmptyState title="Choose a coach" description="Pick a coach or staff member above to set how they are paid." />
        </DataPanel>
      ) : (
        <>
          <DataPanel
            className="mt-3"
            title={`How ${coachName} is paid`}
            subtitle={planState.current ? `Now: ${PAY_PLAN_LABELS[planState.current.type]}` : "No pay plan yet"}
            icon={GraduationCap}
          >
            <PayPlanForm
              coachId={selectedCoach}
              coachName={coachName}
              current={planState.current ? toFormPlan(planState.current) : null}
              plans={planState.plans.map(toFormPlan)}
              defaultMonth={academyMonthOf(now)}
              saveAction={saveCoachPayPlan}
              deleteAction={deleteCoachPayPlan}
              savedMessage={/^(Saved\.|Plan removed\.)/.test(value(params, "saved")) ? value(params, "saved").slice(0, 400) : ""}
            />
          </DataPanel>

          {planType === "per_class" ? (
            <DataPanel className="mt-3" title={`Batch rates for ${coachName}`} subtitle="What each regular class pays, per batch" icon={Layers}>
              <BatchRateGrid coachId={selectedCoach} rows={batchRows} action={saveBatchRate} />
            </DataPanel>
          ) : (
            <p className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
              {planType === "per_hour"
                ? `${coachName} is paid by the hour, so there are no batch rates to set.`
                : planType === "monthly"
                  ? `${coachName} is paid a fixed monthly amount, so there are no batch rates to set.`
                  : "Save a pay plan first. If you choose Per class, the batch rates appear here."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
