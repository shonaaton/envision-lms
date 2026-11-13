import { describe, expect, it } from "vitest";
import {
  exportRegisterRows,
  exportRegisterSheets,
  financialYearOf,
  monthlyBreakdown,
  monthsOfFinancialYear,
  resolveExportPeriod,
  summarizeExportRows,
} from "./exportInvoiceReport";

const exportInvoice = (over: Record<string, any> = {}) => ({
  _id: over._id || "a",
  invoiceNumber: over.invoiceNumber || "ENV/26-27/001",
  issueDate: new Date(over.issueDate || "2026-11-14"),
  status: over.status || "paid",
  title: "Coaching, Nov 2026",
  amount: over.totalAmount ?? 1901250,
  totalAmount: over.totalAmount ?? 1901250,
  student: { _id: "s1", name: "Client One", username: "client@ENV", email: "c@example.com" },
  paymentTransactions: over.paymentTransactions ?? [{ mode: "other", amount: 1901250, paidAt: new Date("2026-11-14T10:00:00Z"), referenceNumber: "pay_123" }],
  exportSupply: { currency: over.currency || "USD", foreignAmount: over.foreignAmount ?? 22500, exchangeRate: over.exchangeRate ?? 84.5, country: "United States", lutArn: "AD191126003090O", lutFiledOn: "2026-11-10" },
});

describe("export invoice register periods", () => {
  it("names the Indian financial year from April", () => {
    expect(financialYearOf("2026-11-14")).toBe("2026-27");
    expect(financialYearOf("2027-03-31")).toBe("2026-27");
    expect(financialYearOf("2027-04-01")).toBe("2027-28");
    expect(monthsOfFinancialYear("2026-27")).toEqual([
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
  });

  it("reads a month or a financial year, else the current month", () => {
    expect(resolveExportPeriod({ month: "2027-02" })).toMatchObject({ kind: "month", from: "2027-02-01", to: "2027-02-28" });
    expect(resolveExportPeriod({ fy: "2026-27" })).toMatchObject({ kind: "fy", from: "2026-04-01", to: "2027-03-31" });
    expect(resolveExportPeriod({ fy: "2026-28" }, new Date("2026-11-14T06:00:00Z"))).toMatchObject({ kind: "month", month: "2026-11" });
    expect(resolveExportPeriod({ month: "nope" }, new Date("2026-11-30T20:00:00Z"))).toMatchObject({ month: "2026-12" });
  });
});

describe("export invoice register rows", () => {
  it("keeps only export invoices dated inside the period, in academy time", () => {
    const invoices = [
      exportInvoice(),
      exportInvoice({ _id: "b", invoiceNumber: "ENV/26-27/002", issueDate: "2026-10-31T19:00:00Z" }), // 1 Nov in IST
      exportInvoice({ _id: "c", invoiceNumber: "ENV/26-27/003", issueDate: "2026-12-01" }),
      { _id: "d", invoiceNumber: "ENV/26-27/004", issueDate: new Date("2026-11-10"), status: "paid", totalAmount: 500000 },
    ];
    const rows = exportRegisterRows(invoices, resolveExportPeriod({ month: "2026-11" }));
    expect(rows.map((row) => row.invoiceNumber)).toEqual(["ENV/26-27/002", "ENV/26-27/001"]);
    expect(rows[1]).toMatchObject({ invoiceDate: "2026-11-14", currency: "USD", foreignAmount: 22500, inrValue: 1901250, paidOn: "2026-11-14", paymentReferences: "pay_123", inrReceived: 1901250 });
  });

  it("leaves cancelled invoices out of the totals and sums each currency apart", () => {
    const rows = exportRegisterRows(
      [
        exportInvoice(),
        exportInvoice({ _id: "b", invoiceNumber: "ENV/26-27/002", currency: "GBP", foreignAmount: 10000, exchangeRate: 110, totalAmount: 1100000, status: "unpaid", paymentTransactions: [] }),
        exportInvoice({ _id: "c", invoiceNumber: "ENV/26-27/003", status: "cancelled", paymentTransactions: [] }),
      ],
      resolveExportPeriod({ fy: "2026-27" }),
    );
    const summary = summarizeExportRows(rows);
    expect(summary).toMatchObject({ invoices: 2, cancelled: 1, paid: 1, unpaid: 1, inrValue: 3001250, inrReceived: 1901250 });
    expect(summary.byCurrency).toEqual([{ currency: "GBP", amount: 10000, invoices: 1 }, { currency: "USD", amount: 22500, invoices: 1 }]);
    const months = monthlyBreakdown(rows, resolveExportPeriod({ fy: "2026-27" }));
    expect(months).toHaveLength(12);
    expect(months.find((item) => item.month === "2026-11")?.invoices).toBe(2);
  });

  it("builds summary, invoice and month sheets", () => {
    const period = resolveExportPeriod({ fy: "2026-27" });
    const rows = exportRegisterRows([exportInvoice()], period);
    const sheets = exportRegisterSheets(rows, period, { gstin: "19AALFE6840P1ZN", legalName: "Envisions Chess Academy LLP" });
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Summary", "Export invoices", "By month"]);
    expect(sheets[1].rows[0][sheets[1].columns.findIndex((column) => column.label === "Export Type")]).toBe("WOPAY");
    expect(sheets[2].rows).toHaveLength(13);
  });
});
