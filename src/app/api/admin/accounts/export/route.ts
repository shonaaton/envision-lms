import { NextResponse } from "next/server";

import { resolveAccountsViewer } from "@/lib/accounts/access";
import { EXPENSE_CATEGORIES, accountCategory, categoryLabel } from "@/lib/accounts/categories";
import { accountsFyOptions, accountsRangeForFy, loadAccounts } from "@/lib/accounts/data";
import { listEntries } from "@/lib/accounts/ledger";
import { LEDGER_TEMPLATES } from "@/lib/accounts/ledgerImport";
import type { MonthAccounts } from "@/lib/accounts/metrics";
import { buildSpreadsheet, spreadsheetHeaders, type Sheet } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/**
 * The books as a workbook (P&L by month, per-student figures, ledger), or a
 * blank import template. Admin only, like every Accounts route.
 */
export async function GET(req: Request) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);

  const template = url.searchParams.get("template");
  if (template === "expense" || template === "income") {
    const { headers, example } = LEDGER_TEMPLATES[template];
    const body = buildSpreadsheet("csv", [{ name: "Template", columns: headers.map((label) => ({ label })), rows: example }]);
    return new NextResponse(new Uint8Array(body), {
      headers: spreadsheetHeaders("csv", template === "expense" ? "accounts-costs-template" : "accounts-offline-income-template", body),
    });
  }

  const options = accountsFyOptions();
  const requested = Number(url.searchParams.get("fy"));
  const fyStart = options.includes(requested) ? requested : options[0];
  const range = accountsRangeForFy(fyStart);
  const data = await loadAccounts(range);
  const { months, total } = data.report;
  const columns = [...months, total];
  const header = [{ label: "" }, ...months.map((m) => ({ label: m.month, type: "money" as const })), { label: "Total", type: "money" as const }];
  const line = (label: string, pick: (m: MonthAccounts) => number | null) => [label, ...columns.map((m) => pick(m) ?? "")];

  const pnl: Sheet = {
    name: "Profit and loss",
    columns: header,
    rows: [
      line("GST invoices (net of GST)", (m) => m.revenue.gstPortalNet),
      line("Non-GST invoices (portal)", (m) => m.revenue.nonGstPortal),
      line("Offline fees (non-GST)", (m) => m.revenue.offline),
      line("Bank fees not in the portal", (m) => m.revenue.bankNotInPortal),
      line("Other portal payments", (m) => m.revenue.otherPortal),
      line("Refunds", (m) => -m.revenue.refunds),
      line("Other income", (m) => m.revenue.otherIncome),
      line("REVENUE", (m) => m.revenue.total),
      line("Teacher pay (gross)", (m) => m.cost.teacher),
      line("GROSS PROFIT", (m) => m.grossProfit),
      ...EXPENSE_CATEGORIES.filter((category) => category.key !== "teacher_pay").map((category) =>
        line(category.label, (m) => m.cost.byCategory[category.key] || 0)
      ),
      line("TOTAL COST", (m) => m.cost.total),
      line("NET PROFIT / LOSS", (m) => m.netProfit),
      line("GST collected", (m) => m.liabilities.gstCollected),
      line("GST paid", (m) => m.liabilities.gstPaid),
      line("TDS withheld", (m) => m.liabilities.tdsWithheld),
      line("TDS deposited", (m) => m.liabilities.tdsDeposited),
    ],
  };

  const count = (label: string, pick: (m: MonthAccounts) => number | null) => [label, ...columns.map((m) => pick(m) ?? "")];
  const students: Sheet = {
    name: "Per student",
    columns: [{ label: "" }, ...months.map((m) => ({ label: m.month })), { label: "Year (avg / per student-month)" }],
    rows: [
      count("Active students", (m) => m.students.active),
      count("Paying students", (m) => m.students.paying),
      count("New students", (m) => m.students.new),
      count("Students left", (m) => m.students.left),
      count("Gross margin %", (m) => m.grossMargin),
      count("Net margin %", (m) => m.netMargin),
      count("Revenue growth MoM %", (m) => m.growth.revenue),
      count("Profit growth MoM %", (m) => m.growth.profit),
      count("Revenue per paying student (Rs)", (m) => (m.perPaying.revenue === null ? null : m.perPaying.revenue / 100)),
      count("Cost per paying student (Rs)", (m) => (m.perPaying.cost === null ? null : m.perPaying.cost / 100)),
      count("Profit per paying student (Rs)", (m) => (m.perPaying.profit === null ? null : m.perPaying.profit / 100)),
      count("Revenue per active student (Rs)", (m) => (m.perActive.revenue === null ? null : m.perActive.revenue / 100)),
      count("Cost per active student (Rs)", (m) => (m.perActive.cost === null ? null : m.perActive.cost / 100)),
      count("Profit per active student (Rs)", (m) => (m.perActive.profit === null ? null : m.perActive.profit / 100)),
      count("Marketing cost per new student (Rs)", (m) => (m.cac === null ? null : m.cac / 100)),
      count("Break-even paying students", (m) => m.breakEvenStudents),
    ],
  };

  const entries = await listEntries({ months: data.months });
  const ledger: Sheet = {
    name: "Ledger",
    columns: [
      { label: "Date", type: "date" },
      { label: "Month" },
      { label: "Type" },
      { label: "Category" },
      { label: "Amount", type: "money" },
      { label: "GST inside", type: "money" },
      { label: "TDS inside", type: "money" },
      { label: "Description" },
      { label: "Paid to / from" },
      { label: "Student" },
      { label: "Source" },
    ],
    rows: entries.map((entry) => [
      new Date(entry.date),
      entry.month,
      accountCategory(entry.category)?.kind || entry.kind,
      categoryLabel(entry.category),
      entry.amount,
      entry.gstAmount,
      entry.tdsAmount,
      entry.description,
      entry.counterparty,
      entry.studentName,
      entry.source,
    ]),
  };

  const body = buildSpreadsheet("xlsx", [pnl, students, ledger]);
  return new NextResponse(new Uint8Array(body), { headers: spreadsheetHeaders("xlsx", `accounts-${range.label.replace(/\s+/g, "-")}`, body) });
}
