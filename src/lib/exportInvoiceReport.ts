// The export (LUT) invoice register handed to the accounts team: every export
// invoice of a month or an Indian financial year (April-March), with what
// GSTR-1 table 6A (exports without payment of tax) and the LUT reconciliation
// need. Pure: the page and the Excel route feed it invoices, so the screen
// and the download can never disagree.

import { academyDateKey } from "@/lib/academyTime";
import { exportForeignTotal } from "@/lib/exportInvoice";
import type { Sheet } from "@/lib/spreadsheet";

export type ExportPeriod =
  | { kind: "month"; month: string; from: string; to: string; label: string; fileLabel: string }
  | { kind: "fy"; fy: string; from: string; to: string; label: string; fileLabel: string };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthLabel(month: string) {
  const [year, mm] = month.split("-").map(Number);
  return `${MONTH_NAMES[(mm || 1) - 1]} ${year}`;
}

/** "2026-27" for any date from 1 Apr 2026 to 31 Mar 2027. */
export function financialYearOf(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The twelve months of a financial year, April first. */
export function monthsOfFinancialYear(fy: string) {
  const start = Number(fy.slice(0, 4));
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((3 + index) % 12) + 1;
    const year = month >= 4 ? start : start + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

/**
 * Reads ?month=2026-11 or ?fy=2026-27; anything else is the current month in
 * academy time. A month in the future is allowed (it just has no rows).
 */
export function resolveExportPeriod(params: { month?: string | null; fy?: string | null }, now = new Date()): ExportPeriod {
  const fy = String(params.fy || "");
  const fyMatch = /^(\d{4})-(\d{2})$/.exec(fy);
  if (fyMatch && Number(fyMatch[2]) === (Number(fyMatch[1]) + 1) % 100) {
    const start = Number(fyMatch[1]);
    return {
      kind: "fy",
      fy,
      from: `${start}-04-01`,
      to: `${start + 1}-03-31`,
      label: `FY ${fy} (1 Apr ${start} to 31 Mar ${start + 1})`,
      fileLabel: `FY-${fy}`,
    };
  }
  const requested = String(params.month || "");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : academyDateKey(now).slice(0, 7);
  const [year, mm] = month.split("-").map(Number);
  return {
    kind: "month",
    month,
    from: `${month}-01`,
    to: `${month}-${String(lastDay(year, mm)).padStart(2, "0")}`,
    label: monthLabel(month),
    fileLabel: month,
  };
}

export type ExportRegisterRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  month: string;
  status: string;
  /** Cancelled invoices are listed but left out of every total and the return. */
  counts: boolean;
  clientName: string;
  clientId: string;
  clientEmail: string;
  country: string;
  address: string;
  description: string;
  currency: string;
  foreignAmount: number;
  exchangeRate: number;
  /** INR paise: the taxable value and the invoice value (no tax is charged). */
  inrValue: number;
  lutArn: string;
  lutFiledOn: string;
  paidOn: string;
  paymentModes: string;
  paymentReferences: string;
  /** INR paise recorded as received. */
  inrReceived: number;
};

function dateKeyOf(value: unknown) {
  if (!value) return "";
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? "" : academyDateKey(date);
}

export function exportRegisterRows(invoices: any[], period: Pick<ExportPeriod, "from" | "to">): ExportRegisterRow[] {
  return invoices
    .filter((invoice) => invoice?.exportSupply?.currency)
    .map((invoice) => {
      const exp = invoice.exportSupply;
      const invoiceDate = dateKeyOf(invoice.issueDate || invoice.createdAt);
      const transactions: any[] = Array.isArray(invoice.paymentTransactions) ? invoice.paymentTransactions : [];
      const lastPaid = transactions.map((item) => dateKeyOf(item.paidAt)).filter(Boolean).sort().pop() || dateKeyOf(invoice.paidAt);
      const received = transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
        || (invoice.status === "paid" ? Number(invoice.totalAmount || 0) : 0);
      const student = invoice.student && typeof invoice.student === "object" ? invoice.student : {};
      return {
        id: String(invoice._id),
        invoiceNumber: String(invoice.invoiceNumber || ""),
        invoiceDate,
        month: invoiceDate.slice(0, 7),
        status: String(invoice.status || "unpaid"),
        counts: invoice.status !== "cancelled" && invoice.status !== "draft",
        clientName: String(student.name || ""),
        clientId: String(student.username || student._id || ""),
        clientEmail: String(student.email || ""),
        country: String(exp.country || ""),
        address: String(exp.address || ""),
        description: String(invoice.title || ""),
        currency: String(exp.currency),
        foreignAmount: exportForeignTotal(invoice),
        exchangeRate: Number(exp.exchangeRate || 0),
        inrValue: Number(invoice.totalAmount || 0),
        lutArn: String(exp.lutArn || ""),
        lutFiledOn: String(exp.lutFiledOn || ""),
        paidOn: invoice.status === "paid" || transactions.length ? lastPaid : "",
        paymentModes: Array.from(new Set(transactions.map((item) => String(item.mode || "")).filter(Boolean))).join(", "),
        paymentReferences: Array.from(new Set([...transactions.map((item) => String(item.referenceNumber || "")), String(invoice.referenceNumber || "")].filter(Boolean))).join(", "),
        inrReceived: received,
      };
    })
    .filter((row) => row.invoiceDate >= period.from && row.invoiceDate <= period.to)
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
}

export type ExportSummary = {
  invoices: number;
  cancelled: number;
  paid: number;
  unpaid: number;
  inrValue: number;
  inrReceived: number;
  /** Foreign totals per currency, in 1/100 units. */
  byCurrency: Array<{ currency: string; amount: number; invoices: number }>;
};

export function summarizeExportRows(rows: ExportRegisterRow[]): ExportSummary {
  const counted = rows.filter((row) => row.counts);
  const currencies = new Map<string, { amount: number; invoices: number }>();
  for (const row of counted) {
    const entry = currencies.get(row.currency) || { amount: 0, invoices: 0 };
    entry.amount += row.foreignAmount;
    entry.invoices += 1;
    currencies.set(row.currency, entry);
  }
  return {
    invoices: counted.length,
    cancelled: rows.length - counted.length,
    paid: counted.filter((row) => row.status === "paid").length,
    unpaid: counted.filter((row) => row.status !== "paid").length,
    inrValue: counted.reduce((sum, row) => sum + row.inrValue, 0),
    inrReceived: counted.reduce((sum, row) => sum + row.inrReceived, 0),
    byCurrency: Array.from(currencies, ([currency, entry]) => ({ currency, ...entry })).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

/** One summary row per month of the period: what the accountant files each month. */
export function monthlyBreakdown(rows: ExportRegisterRow[], period: ExportPeriod) {
  const months = period.kind === "fy" ? monthsOfFinancialYear(period.fy) : [period.month];
  return months.map((month) => ({ month, ...summarizeExportRows(rows.filter((row) => row.month === month)) }));
}

// Spreadsheet dates are written as local noon of the academy date, so the day
// never shifts whatever time zone the server runs in.
function sheetDate(key: string) {
  return key ? new Date(`${key}T12:00:00`) : "";
}

function foreignText(byCurrency: ExportSummary["byCurrency"]) {
  return byCurrency.map((item) => `${item.currency} ${(item.amount / 100).toFixed(2)}`).join("; ");
}

export function exportRegisterSheets(rows: ExportRegisterRow[], period: ExportPeriod, academy: { gstin: string; legalName: string }): Sheet[] {
  const summary = summarizeExportRows(rows);
  const months = monthlyBreakdown(rows, period);
  return [
    {
      name: "Summary",
      columns: [{ label: "Item" }, { label: "Value" }],
      rows: [
        ["Report", "Export of services under LUT (zero-rated, without payment of IGST)"],
        ["Supplier", academy.legalName],
        ["GSTIN", academy.gstin],
        ["Period", period.label],
        ["GSTR-1 table", "6A - Exports, export type WOPAY (without payment of tax)"],
        ["Place of supply", "96 - Other Countries"],
        ["Invoices issued (excluding cancelled)", summary.invoices],
        ["Cancelled invoices (not reported)", summary.cancelled],
        ["Taxable value (INR)", (summary.inrValue / 100).toFixed(2)],
        ["IGST", "0.00 (export under LUT)"],
        ["Value in foreign currency", foreignText(summary.byCurrency) || "-"],
        ["Received so far (INR)", (summary.inrReceived / 100).toFixed(2)],
        ["Paid invoices", summary.paid],
        ["Unpaid invoices", summary.unpaid],
        ["LUT ARN(s) used", Array.from(new Set(rows.map((row) => row.lutArn).filter(Boolean))).join(", ") || "-"],
      ],
    },
    {
      name: "Export invoices",
      columns: [
        { label: "Invoice No" },
        { label: "Invoice Date", type: "date" },
        { label: "Status" },
        { label: "Report in GSTR-1" },
        { label: "Export Type" },
        { label: "Client Name" },
        { label: "Client ID" },
        { label: "Client Email" },
        { label: "Country" },
        { label: "Client Address" },
        { label: "Description" },
        { label: "Currency" },
        { label: "Foreign Amount", type: "number" },
        { label: "Exchange Rate (INR per unit)", type: "number" },
        { label: "Taxable Value", type: "money" },
        { label: "IGST Rate", type: "percent" },
        { label: "IGST Amount", type: "money" },
        { label: "Invoice Value", type: "money" },
        { label: "Place of Supply" },
        { label: "LUT ARN" },
        { label: "LUT Filed On", type: "date" },
        { label: "Payment Received On", type: "date" },
        { label: "Payment Mode" },
        { label: "Payment Reference" },
        { label: "Received", type: "money" },
      ],
      rows: rows.map((row) => [
        row.invoiceNumber,
        sheetDate(row.invoiceDate),
        row.status,
        row.counts ? "Yes" : "No (cancelled)",
        "WOPAY",
        row.clientName,
        row.clientId,
        row.clientEmail,
        row.country,
        row.address,
        row.description,
        row.currency,
        row.foreignAmount / 100,
        row.exchangeRate,
        row.inrValue,
        0,
        0,
        row.inrValue,
        "96 - Other Countries",
        row.lutArn,
        sheetDate(row.lutFiledOn),
        sheetDate(row.paidOn),
        row.paymentModes,
        row.paymentReferences,
        row.inrReceived,
      ]),
    },
    {
      name: "By month",
      columns: [
        { label: "Month" },
        { label: "Invoices", type: "number" },
        { label: "Cancelled", type: "number" },
        { label: "Taxable Value", type: "money" },
        { label: "IGST", type: "money" },
        { label: "Foreign Currency Value" },
        { label: "Received", type: "money" },
        { label: "Unpaid Invoices", type: "number" },
      ],
      rows: [
        ...months.map((item) => [
          monthLabel(item.month),
          item.invoices,
          item.cancelled,
          item.inrValue,
          0,
          foreignText(item.byCurrency),
          item.inrReceived,
          item.unpaid,
        ]),
        ["Total", summary.invoices, summary.cancelled, summary.inrValue, 0, foreignText(summary.byCurrency), summary.inrReceived, summary.unpaid],
      ],
    },
  ];
}
