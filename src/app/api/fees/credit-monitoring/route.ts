import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { CreditLedger, FeeAssignment } from "@/models/Fee";
import { requireFeesAccess } from "@/lib/feesAccess";

export const dynamic = "force-dynamic";

function td(value: unknown) {
  return `<td>${String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
}

function workbook(title: string, headers: string[], rows: unknown[][]) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><h2>${title}</h2><table border="1"><thead><tr>${headers
    .map((header) => `<th>${header}</th>`)
    .join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(td).join("")}</tr>`).join("")}</tbody></table></body></html>`;
}

function csv(headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

function statusFor(balance: number) {
  if (balance <= 0) return "Recharge required";
  if (balance <= 3) return "Low credit alert";
  return "Healthy";
}

function filterAssignments(assignments: any[], url: URL) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const filter = url.searchParams.get("filter") || "all";
  const plan = url.searchParams.get("plan") || "";
  const min = url.searchParams.get("min");
  const max = url.searchParams.get("max");

  return assignments
    .filter((assignment) => !q || `${assignment.student?.name || ""} ${assignment.student?.username || ""} ${assignment.student?.email || ""}`.toLowerCase().includes(q))
    .filter((assignment) => !plan || assignment.plan?._id?.toString?.() === plan)
    .filter((assignment) => filter !== "low" || Number(assignment.creditBalance || 0) <= 3)
    .filter((assignment) => filter !== "empty" || Number(assignment.creditBalance || 0) <= 0)
    .filter((assignment) => filter !== "healthy" || Number(assignment.creditBalance || 0) > 3)
    .filter((assignment) => min === null || Number(assignment.creditBalance || 0) >= Number(min || 0))
    .filter((assignment) => max === null || Number(assignment.creditBalance || 0) <= Number(max || 0));
}

export async function GET(req: Request) {
  if (!(await requireFeesAccess("export"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "xls";
  const assignments = await FeeAssignment.find({ type: "credits" }).populate("student plan").sort({ creditBalance: 1 }).lean();
  const filtered = filterAssignments(assignments, url);
  const headers = ["Student", "Student ID", "Email", "Plan", "Purchased", "Consumed", "Remaining", "Status", "Updated At"];
  const rows = filtered.map((assignment: any) => [
    assignment.student?.name || "",
    assignment.student?.username || assignment.student?._id?.toString?.() || "",
    assignment.student?.email || "",
    assignment.plan?.name || "",
    assignment.totalCreditsPurchased || 0,
    assignment.totalCreditsConsumed || 0,
    assignment.creditBalance || 0,
    statusFor(Number(assignment.creditBalance || 0)),
    assignment.updatedAt ? new Date(assignment.updatedAt).toLocaleString("en-IN") : "",
  ]);

  if (format === "history") {
    const ledgerHeaders = ["Date", "Student", "Student ID", "Type", "Credits", "Balance After", "Invoice", "Reason", "Performed By", "Administrator Role"];
    const ledgers = await CreditLedger.find({}).populate("student invoice performedBy").sort({ createdAt: -1 }).limit(1000).lean();
    const ledgerRows = ledgers.map((ledger: any) => [
      ledger.createdAt ? new Date(ledger.createdAt).toLocaleString("en-IN") : "",
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
    return new NextResponse(csv(ledgerHeaders, ledgerRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"credit-ledger-history.csv\"",
      },
    });
  }

  if (format === "csv") {
    return new NextResponse(csv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"credit-monitoring.csv\"",
      },
    });
  }

  return new NextResponse(workbook("Credit Monitoring", headers, rows), {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"credit-monitoring.xls\"",
    },
  });
}
