import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { CreditLedger, FeeAssignment } from "@/models/Fee";
import { requireFeesAccess } from "@/lib/feesAccess";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders, type SheetColumn } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

function statusFor(balance: number) {
  if (balance <= 0) return "Recharge required";
  if (balance === 1) return "Low credit alert";
  return "Healthy";
}

function filterAssignments(assignments: any[], url: URL) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const raw = url.searchParams.get("filter") || "all";
  // `deactivated` is the old name for the dormant list, kept working for links
  // that were saved before paused students joined it.
  const filter = raw === "deactivated" ? "dormant" : raw;
  const plan = url.searchParams.get("plan") || "";
  const min = url.searchParams.get("min");
  const max = url.searchParams.get("max");

  return assignments
    // The export mirrors the page: students who have left or been paused are out
    // of every list except the one that asks for them.
    .filter((assignment) =>
      filter === "dormant"
        ? assignment.student?.isActive === false || assignment.student?.isPaused === true
        : assignment.student?.isActive !== false && assignment.student?.isPaused !== true
    )
    .filter((assignment) => !q || `${assignment.student?.name || ""} ${assignment.student?.username || ""} ${assignment.student?.email || ""}`.toLowerCase().includes(q))
    .filter((assignment) => !plan || assignment.plan?._id?.toString?.() === plan)
    .filter((assignment) => filter !== "low" || Number(assignment.creditBalance || 0) === 1)
    .filter((assignment) => filter !== "empty" || Number(assignment.creditBalance || 0) <= 0)
    .filter((assignment) => filter !== "healthy" || Number(assignment.creditBalance || 0) > 1)
    .filter((assignment) => min === null || Number(assignment.creditBalance || 0) >= Number(min || 0))
    .filter((assignment) => max === null || Number(assignment.creditBalance || 0) <= Number(max || 0));
}

export async function GET(req: Request) {
  if (!(await requireFeesAccess("export", "creditMonitoring"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const url = new URL(req.url);
  const formatParam = url.searchParams.get("format");
  // `format=history` is the legacy link shape, from when the ledger download was
  // modelled as a third file format instead of a second report.
  const history = url.searchParams.get("report") === "history" || formatParam === "history";
  const format = resolveFormat(formatParam === "history" ? "csv" : formatParam, "xlsx");

  if (history) {
    const columns: SheetColumn[] = [
      { label: "Date", type: "datetime" },
      { label: "Student" },
      { label: "Student ID" },
      { label: "Type" },
      { label: "Credits", type: "number" },
      { label: "Balance After", type: "number" },
      { label: "Invoice" },
      { label: "Reason" },
      { label: "Performed By" },
      { label: "Administrator Role" },
    ];
    const ledgers = await CreditLedger.find({}).populate("student invoice performedBy").sort({ createdAt: -1 }).limit(1000).lean();
    const rows = ledgers.map((ledger: any) => [
      ledger.createdAt,
      ledger.student?.name || "",
      ledger.student?.username || ledger.student?._id?.toString?.() || "",
      ledger.type,
      ledger.credits,
      ledger.balanceAfter,
      ledger.invoice?.invoiceNumber || "",
      ledger.note || "",
      ledger.performedBy?.name || ledger.performedBy?.username || "",
      ledger.performedByRole || "",
    ]);
    const body = buildSpreadsheet(format, [{ name: "Credit ledger history", columns, rows }]);
    return new NextResponse(body, { headers: spreadsheetHeaders(format, "credit-ledger-history", body) });
  }

  const assignments = await FeeAssignment.find({ type: "credits" }).populate("student plan").sort({ creditBalance: 1 }).lean();
  const filtered = filterAssignments(assignments, url);
  const columns: SheetColumn[] = [
    { label: "Student" },
    { label: "Student ID" },
    { label: "Email" },
    { label: "Plan" },
    { label: "Purchased", type: "number" },
    { label: "Consumed", type: "number" },
    { label: "Remaining", type: "number" },
    { label: "Status" },
    { label: "Account" },
    { label: "Updated At", type: "datetime" },
  ];
  const rows = filtered.map((assignment: any) => [
    assignment.student?.name || "",
    assignment.student?.username || assignment.student?._id?.toString?.() || "",
    assignment.student?.email || "",
    assignment.plan?.name || "",
    assignment.totalCreditsPurchased || 0,
    assignment.totalCreditsConsumed || 0,
    assignment.creditBalance || 0,
    statusFor(Number(assignment.creditBalance || 0)),
    assignment.student?.isActive === false
      ? `Left${assignment.student?.deactivatedAt ? ` on ${new Date(assignment.student.deactivatedAt).toLocaleDateString("en-IN")}` : ""}`
      : assignment.student?.isPaused === true
        ? "Paused"
        : "Active",
    assignment.updatedAt,
  ]);

  const body = buildSpreadsheet(format, [{ name: "Credit monitoring", columns, rows }]);
  return new NextResponse(body, { headers: spreadsheetHeaders(format, "credit-monitoring", body) });
}
