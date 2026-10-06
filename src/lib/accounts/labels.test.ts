import { describe, expect, it } from "vitest";

import { parseMonthKey } from "@/lib/accounts/entryInput";
import { readLabel } from "@/lib/accounts/labels";
import { emptyMatchContext, suggestFor } from "@/lib/accounts/match";
import { parseStatementRows } from "@/lib/accounts/statement";

const at = (day: string) => new Date(`${day}T12:00:00+05:30`);

describe("readLabel - the academy's own statement labels", () => {
  const debit = (label: string) => readLabel(label, "debit");
  const credit = (label: string) => readLabel(label, "credit");

  it("books each label used on the 2026-27 statement", () => {
    expect(credit("student fees")).toEqual({ category: "student_fees", monthShift: 0 });
    expect(credit("loan taken")?.category).toBe("loan");
    expect(debit("teacher fees previous month")).toEqual({ category: "teacher_pay", monthShift: -1 });
    expect(debit("teacher cost previous month")).toEqual({ category: "teacher_pay", monthShift: -1 });
    expect(debit("teacher fees")).toEqual({ category: "teacher_pay", monthShift: 0 });
    expect(debit("gst previous month")).toEqual({ category: "gst_paid", monthShift: -1 });
    expect(debit("sales person salary")).toEqual({ category: "sales_salaries", monthShift: -1 });
    expect(debit("meta ads")?.category).toBe("marketing");
    expect(debit("admin cost previous month")).toEqual({ category: "staff_salaries", monthShift: -1 });
    expect(debit("tds")?.category).toBe("tds_paid");
    expect(debit("digital marketing agency fees")?.category).toBe("marketing");
    expect(debit("crm subscription")?.category).toBe("software");
    expect(debit("tech cost")?.category).toBe("software");
    expect(credit("refund tech cost")?.category).toBe("software");
    expect(debit("refund")?.category).toBe("student_refunds");
    expect(debit("mobile bill")?.category).toBe("internet_phone");
    expect(debit("trade license this financial year")?.category).toBe("licences");
    expect(debit("trade license")?.category).toBe("licences");
    expect(debit("mca fees")?.category).toBe("licences");
    expect(debit("affiliation fees")?.category).toBe("licences");
    expect(credit("teacher fees this financial year")?.category).toBe("student_fees");
    expect(debit("electricity bil")?.category).toBe("electricity");
    expect(debit("banking charge")?.category).toBe("bank_charges");
  });

  it("ignores an empty label", () => {
    expect(readLabel("", "debit")).toBeNull();
  });
});

describe("suggestFor with labels", () => {
  const context = emptyMatchContext();

  it("books 'previous month' teacher pay to the month before it was paid", () => {
    const suggestion = suggestFor(
      { date: at("2026-05-07"), month: "2026-05", narration: "IMPS-61275-ANKIT KUMAR-APRIL 2026", reference: "", debit: 1_309_500, credit: 0, label: "teacher fees previous month" },
      context
    );
    expect(suggestion).toMatchObject({ type: "category", category: "teacher_pay", month: "2026-04" });
  });

  it("refuses to add teacher pay for September or later outside the staff invoices", () => {
    const suggestion = suggestFor(
      { date: at("2026-10-07"), month: "2026-10", narration: "NEFT DR-ANKIT KUMAR", reference: "", debit: 450_000, credit: 0, label: "teacher fees previous month" },
      context
    );
    expect(suggestion.type).toBe("coach_unmatched");
  });

  it("turns money back on a cost into a refund of that cost", () => {
    const suggestion = suggestFor(
      { date: at("2026-06-09"), month: "2026-06", narration: "NEFT CR-WEBSITE LEARNERS", reference: "", debit: 0, credit: 1_180_000, label: "refund tech cost" },
      context
    );
    expect(suggestion).toMatchObject({ type: "category", category: "software", refund: true });
  });

  it("books a labelled student fee as a fee receipt, never as a separate offline fee", () => {
    const suggestion = suggestFor(
      { date: at("2026-04-01"), month: "2026-04", narration: "UPI-SOMEONE", reference: "1", debit: 0, credit: 380_000, label: "student fees" },
      context
    );
    expect(suggestion.type).toBe("fee_receipt");
  });

  it("pins a 'previous month' salary to that month's staff invoice only", () => {
    const coaches = [
      { staffId: "s1", name: "Saptarshi Banerjee", names: ["Saptarshi Banerjee"], invoices: [{ id: "sep", month: "2026-09", total: 1_400_000 }] },
    ];
    const august = suggestFor(
      { date: at("2026-09-08"), month: "2026-09", narration: "NEFT DR-SAPTARSHI BANERJEE", reference: "", debit: 1_260_000, credit: 0, label: "admin cost previous month" },
      { ...context, coaches }
    );
    expect(august).toMatchObject({ type: "category", category: "staff_salaries", month: "2026-08" });
    const september = suggestFor(
      { date: at("2026-10-03"), month: "2026-10", narration: "NEFT DR-SAPTARSHI BANERJEE", reference: "", debit: 1_260_000, credit: 0, label: "admin cost previous month" },
      { ...context, coaches }
    );
    expect(september).toMatchObject({ type: "staff_invoice", staffInvoice: "sep" });
  });

  it("prefers a portal payment over the label", () => {
    const portalRefs = new Map([["0000318045927918", { invoices: ["inv"], payments: [], label: "ENV/1" }]]);
    const suggestion = suggestFor(
      { date: at("2026-04-01"), month: "2026-04", narration: "UPI-X", reference: "0000318045927918", debit: 0, credit: 380_000, label: "student fees" },
      { ...context, portalRefs }
    );
    expect(suggestion.type).toBe("portal");
  });
});

describe("statement label column", () => {
  it("reads the unheaded column the academy types its labels into", () => {
    const parsed = parseStatementRows([
      ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
      ["01/04/26", "UPI-A", "1", "01/04/26", "", "3800", "69173.16", "student fees"],
      ["01/04/26", "SI CESC", "2", "01/04/26", "110", "", "69063.16", "electricity bil"],
      ["02/04/26", "FACEBOOK", "3", "02/04/26", "5000", "", "64063.16", "meta ads"],
    ]);
    expect(parsed.columns.label).toBe(7);
    expect(parsed.transactions.map((row) => row.label)).toEqual(["student fees", "electricity bil", "meta ads"]);
  });
});

describe("parseMonthKey", () => {
  it("reads months as people write them", () => {
    expect(parseMonthKey("Apr 2026")).toBe("2026-04");
    expect(parseMonthKey("april-26")).toBe("2026-04");
    expect(parseMonthKey("2026-09")).toBe("2026-09");
    expect(parseMonthKey("09/2026")).toBe("2026-09");
    expect(parseMonthKey("Sept 2026")).toBe("2026-09");
    expect(parseMonthKey("13/2026")).toBeNull();
    expect(parseMonthKey("hello")).toBeNull();
  });
});

describe("salary paid without a staff invoice", () => {
  const sayandeb = { staffId: "sd", name: "Sayandeb Halder", names: ["Sayandeb Halder"], invoices: [] };

  it("reads the bank's split spelling of a name and books the pay to the person for the month before", () => {
    const suggestion = suggestFor(
      { date: at("2026-10-09"), month: "2026-10", narration: "NEFT DR-SBIN0001504-SAYAN DEB HALDER-NETBANK", reference: "", debit: 1_350_000, credit: 0, label: "sales person salary" },
      { ...emptyMatchContext(), coaches: [sayandeb] }
    );
    expect(suggestion).toMatchObject({ type: "category", category: "sales_salaries", month: "2026-09", staffId: "sd" });
  });

  it("holds back pay for a portal month that names nobody, so it cannot double an estimate", () => {
    const suggestion = suggestFor(
      { date: at("2026-10-09"), month: "2026-10", narration: "NEFT DR-SOMEONE NEW", reference: "", debit: 1_350_000, credit: 0, label: "sales person salary" },
      emptyMatchContext()
    );
    expect(suggestion.type).toBe("coach_unmatched");
  });
});
