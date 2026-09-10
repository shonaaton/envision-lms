import { NextResponse } from "next/server";

import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { loadCoachPay } from "@/lib/coachPayData";
import { resolvePayPeriod } from "@/lib/payPeriods";
import { PAY_KIND_LABELS, PAY_STATUS_LABELS, RATE_SCOPE_LABELS } from "@/lib/coachPay";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders, type Sheet } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/**
 * The coach cost report, as JSON or as a workbook.
 *
 * A coach hitting this endpoint gets their own lines and nothing else: the
 * scope is forced from the session, never read from the query string, so
 * passing someone else's `coach` id cannot widen what comes back.
 */
export async function GET(req: Request) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const period = resolvePayPeriod(params);
  const requestedCoach = url.searchParams.get("coach") || "";
  const coachId = viewer.canViewAll ? requestedCoach : viewer.userId;

  const { events, summary } = await loadCoachPay(period, {
    coachId: coachId || undefined,
    batchId: url.searchParams.get("batch") || undefined,
    classroomId: url.searchParams.get("classroom") || undefined,
  });

  const format = url.searchParams.get("format");
  if (!format) {
    return NextResponse.json({
      period: { preset: period.preset, label: period.label, from: period.from, to: period.to },
      summary,
      events,
    });
  }

  if (!viewer.canExport) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const resolved = resolveFormat(format, "xlsx");

  const sheets: Sheet[] = [
    {
      name: "Coach Totals",
      columns: [
        { label: "Coach" },
        { label: "Regular Classes", type: "number" },
        { label: "Demo Classes", type: "number" },
        { label: "Substitutions", type: "number" },
        { label: "Conversion Bonuses", type: "number" },
        { label: "Teaching Minutes", type: "number" },
        { label: "Regular Pay", type: "money" },
        { label: "Demo Pay", type: "money" },
        { label: "Substitution Pay", type: "money" },
        { label: "Conversion Bonus", type: "money" },
        { label: "Total Pay", type: "money" },
        { label: "Awaiting Ruling", type: "number" },
        { label: "Value Awaiting Ruling", type: "money" },
        { label: "Classes With No Rate", type: "number" },
      ],
      rows: summary.rows.map((row) => [
        row.coachName,
        row.regularClasses,
        row.demoClasses,
        row.substitutionClasses,
        row.conversionBonuses,
        row.minutes,
        row.regularAmount,
        row.demoAmount,
        row.substitutionAmount,
        row.bonusAmount,
        row.totalAmount,
        row.pendingReview,
        row.pendingAmount,
        row.unpriced,
      ]),
    },
    {
      name: "Class Detail",
      columns: [
        { label: "Date", type: "datetime" },
        { label: "Coach" },
        { label: "Pay Type" },
        { label: "Status" },
        { label: "Classroom" },
        { label: "Batch" },
        { label: "Session", type: "number" },
        { label: "Topic" },
        { label: "Class Outcome" },
        { label: "Minutes", type: "number" },
        { label: "Rate", type: "money" },
        { label: "Rate Unit" },
        { label: "Rate Source" },
        { label: "Covering For" },
        { label: "Students", type: "number" },
        { label: "Amount", type: "money" },
        { label: "Note" },
      ],
      rows: events.map((event) => [
        event.date,
        event.coachName,
        PAY_KIND_LABELS[event.kind],
        PAY_STATUS_LABELS[event.status],
        event.classroomTitle,
        event.batchName,
        event.sessionNumber || "",
        event.topicName,
        event.sessionStatus,
        event.minutes,
        event.rateAmount,
        event.unit === "per_hour" ? "Per hour" : "Per class",
        event.rateSource === "none" ? "Not priced" : RATE_SCOPE_LABELS[event.rateSource],
        event.substitutedForName,
        event.studentCount,
        event.amount,
        event.note,
      ]),
    },
  ];

  const body = buildSpreadsheet(resolved, sheets);
  const slug = period.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(body, { headers: spreadsheetHeaders(resolved, `coach-pay-${slug || "report"}`, body) });
}
