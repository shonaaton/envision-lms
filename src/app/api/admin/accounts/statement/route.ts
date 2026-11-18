import { NextResponse } from "next/server";

import { academyDateKey } from "@/lib/academyTime";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { loadBankStatement } from "@/lib/accounts/bankStatementExport";
import { categoryLabel } from "@/lib/accounts/categories";
import { loadCashStatement } from "@/lib/accounts/cashData";
import { accountsFyOptions, accountsRangeForFy } from "@/lib/accounts/data";
import { monthsBetween } from "@/lib/accounts/metrics";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders, type Sheet } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/**
 * Account statements to download: the cash Sayantan holds, or the HDFC
 * account. `account=cash|bank`, `period=fy:2026` (a whole financial year) or
 * `period=YYYY-MM` (one month), `format=xlsx|csv`. Each workbook has a month-by-
 * month summary and every line with debit, credit and balance. A CSV carries
 * only the lines. Admin only, like every Accounts route.
 */
export async function GET(req: Request) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const account = url.searchParams.get("account") === "bank" ? "bank" : "cash";
  const format = resolveFormat(url.searchParams.get("format"), "xlsx");

  // `period` is "fy:2026" for a whole financial year or "2026-10" for a month.
  const period = url.searchParams.get("period") || "";
  const monthMatch = /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : "";
  const options = accountsFyOptions();
  const fromMonth = monthMatch ? Number(monthMatch.slice(0, 4)) - (Number(monthMatch.slice(5)) < 4 ? 1 : 0) : Number(period.replace(/^fy:/, ""));
  const fyStart = options.includes(fromMonth) ? fromMonth : options[0];
  const range = accountsRangeForFy(fyStart);
  const fyMonths = monthsBetween(range.from, range.to);
  const months = monthMatch && fyMonths.includes(monthMatch) ? [monthMatch] : fyMonths;
  const periodName = months.length === 1 ? months[0] : range.label.replace(/\s+/g, "-");

  let summary: Sheet;
  let lines: Sheet;
  if (account === "cash") {
    const cash = await loadCashStatement(months);
    summary = {
      name: "Month by month",
      columns: [
        { label: "Month" },
        { label: "Opening", type: "money" },
        { label: "Fees in", type: "money" },
        { label: "Other in", type: "money" },
        { label: "Cash in", type: "money" },
        { label: "Cash out", type: "money" },
        { label: "Closing", type: "money" },
      ],
      rows: [
        ...cash.rows.map((row) => [row.month, row.opening, row.feesIn, row.otherIn, row.feesIn + row.otherIn, row.out, row.closing]),
        [
          "Total",
          cash.opening,
          cash.rows.reduce((sum, row) => sum + row.feesIn, 0),
          cash.rows.reduce((sum, row) => sum + row.otherIn, 0),
          cash.rows.reduce((sum, row) => sum + row.feesIn + row.otherIn, 0),
          cash.rows.reduce((sum, row) => sum + row.out, 0),
          cash.closing,
        ],
      ],
    };
    lines = {
      name: `Cash with ${cash.holder}`.slice(0, 31),
      columns: [
        { label: "Date" },
        { label: "Month" },
        { label: "Details" },
        { label: "Type" },
        { label: "From" },
        { label: "Cash in", type: "money" },
        { label: "Cash out", type: "money" },
        { label: "Balance", type: "money" },
      ],
      rows: [
        [null, months[0], "Opening balance", "", "", "", "", cash.opening],
        ...cash.items.map((item) => [
          item.date ? academyDateKey(item.date) : "",
          item.month,
          item.label || "",
          item.category === "fees" ? "Fee (portal bill)" : categoryLabel(item.category || item.group),
          item.source === "portal" ? "Fees" : "Ledger",
          item.flow === "in" ? item.amount : "",
          item.flow === "out" ? item.amount : "",
          item.balance,
        ]),
      ],
    };
  } else {
    const bank = await loadBankStatement(months);
    summary = {
      name: "Month by month",
      columns: [
        { label: "Month" },
        { label: "Opening balance", type: "money" },
        { label: "Credits", type: "money" },
        { label: "Debits", type: "money" },
        { label: "Closing balance", type: "money" },
        { label: "Statement rows", type: "number" },
        { label: "Not on a statement yet: credits", type: "money" },
        { label: "Not on a statement yet: debits", type: "money" },
      ],
      rows: [
        ...bank.summary.map((row) => [row.month, row.opening ?? "", row.credits, row.debits, row.closing ?? "", row.rows, row.pendingCredits, row.pendingDebits]),
        [
          "Total",
          bank.summary[0]?.opening ?? "",
          bank.summary.reduce((sum, row) => sum + row.credits, 0),
          bank.summary.reduce((sum, row) => sum + row.debits, 0),
          [...bank.summary].reverse().find((row) => row.closing !== null)?.closing ?? "",
          bank.summary.reduce((sum, row) => sum + row.rows, 0),
          bank.summary.reduce((sum, row) => sum + row.pendingCredits, 0),
          bank.summary.reduce((sum, row) => sum + row.pendingDebits, 0),
        ],
      ],
    };
    lines = {
      name: "HDFC bank",
      columns: [
        { label: "Date" },
        { label: "Month" },
        { label: "Narration / details" },
        { label: "Reference" },
        { label: "Your label" },
        { label: "Booked as" },
        { label: "Debit", type: "money" },
        { label: "Credit", type: "money" },
        { label: "Balance", type: "money" },
        { label: "Source" },
      ],
      rows: bank.lines.map((line) => [
        academyDateKey(line.date),
        line.month,
        line.details,
        line.reference,
        line.label,
        line.bookedAs,
        line.debit || "",
        line.credit || "",
        line.balance ?? "",
        line.onStatement ? "Bank statement" : "Not on a statement yet (portal / typed)",
      ]),
    };
  }

  const name = `${account === "cash" ? "cash-statement" : "hdfc-statement"}-${periodName}`;
  const body = buildSpreadsheet(format, format === "csv" ? [lines] : [summary, lines]);
  return new NextResponse(new Uint8Array(body), { headers: spreadsheetHeaders(format, name, body) });
}
