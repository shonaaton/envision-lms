import "server-only";

import { getFeesAnalytics } from "@/lib/feesAnalytics";
import type { FeesAnalytics, GstFilter } from "@/lib/feesAnalyticsTypes";

/**
 * The sales cut of the finance analytics.
 *
 * The sales and relationship team is not meant to see collections, GST, or the
 * academy's revenue projections. Hiding those sections in the UI would not be
 * enough - the numbers would still travel to the browser and sit in the network
 * tab. So the filtering happens here, on the server: whatever is not on these
 * two allow-lists never leaves the process.
 *
 * Allow-lists rather than deny-lists on purpose. A new KPI added to
 * `feesAnalytics.ts` is invisible to sales until someone deliberately names it
 * here, which is the safe direction for a mistake to fall.
 */

/** Every KPI the four sales sections read. Keys match `feesAnalytics.ts` `kpis`. */
const SALES_KPIS = [
  // Growth, churn and pauses
  "newStudents",
  "newStudentBilled",
  "newStudentCollected",
  "newStudentRecurring",
  "leftStudents",
  "churnRecurringLost",
  "churnUnpaid",
  "churnLifetime",
  "netStudentGrowth",
  "netRecurringGrowth",
  "pausedStudents",
  "pausedActive",
  "pausedReturning",
  "pausedOnHold",
  "pausedVoidedValue",
  "pausedVoidedCount",
  "pausedUnbilledValue",
  "revenueLostTotal",
  // Demos and conversion
  "demosScheduled",
  "demosDone",
  "demosConverted",
  "demosNoShow",
  "demoConversionRate",
  "demoRevenue",
  "coachCount",
  // Retention
  "retentionStudents",
  "retentionInvoices",
  "retentionCollectedCount",
  "retentionMissedCount",
  "retentionPendingCount",
  "retentionCollectedAmount",
  "retentionMissedAmount",
  "retentionPendingAmount",
  "retentionRateByValue",
  "retentionRateByCount",
  "studentRetentionRate",
  "retainedStudents",
  "churnedExisting",
  // Students and operations
  "activeStudents",
  "creditStudents",
  "monthlyStudents",
  "lowCreditStudents",
  "unassignedStudents",
  "deletedInvoices",
] as const;

/**
 * Drill-down tables sales may open.
 *
 * `deletedInvoices` is deliberately absent even though its count card is shown:
 * the count tells sales that billing needs attention, while the table behind it
 * lists invoice amounts and deletion reasons that they have no reason to read.
 */
const SALES_TABLES = [
  "newStudents",
  "deactivatedStudents",
  "pausedStudents",
  "pausedVoidedInvoices",
  "pausedReturning",
  "demos",
  "demosDone",
  "demosConverted",
  "demosNoShow",
  "coachConversion",
  "retentionCollected",
  "retentionMissed",
  "retentionPending",
  "retentionStudents",
  "activeStudents",
  "creditStudents",
  "lowCredit",
  "monthlyStudents",
  "unassignedStudents",
] as const;

/** The four sections `FinanceDashboard` renders for sales, in order. */
export const SALES_SECTIONS = ["growth", "demos", "retention", "operations"] as const;

function pick<T>(source: Record<string, T>, keys: readonly string[]) {
  return keys.reduce<Record<string, T>>((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});
}

/**
 * Reuses `getFeesAnalytics` wholesale - the computation is identical, only the
 * payload is narrower. GST is pinned to "all" because the GST split only ever
 * affects collections, which sales does not receive.
 */
export async function getSalesAnalytics({ from, to }: { from: Date; to: Date }): Promise<FeesAnalytics> {
  const full = await getFeesAnalytics({ from, to, gst: "all" as GstFilter });
  return {
    generatedAt: full.generatedAt,
    range: full.range,
    gst: "all",
    kpis: pick(full.kpis, SALES_KPIS),
    coachConversion: full.coachConversion,
    tables: pick(full.tables, SALES_TABLES),
  };
}
