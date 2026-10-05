import { describe, expect, it } from "vitest";
import { invoiceReferences } from "./feesMetrics";

describe("invoiceReferences", () => {
  it("shows the payment references recorded when an invoice was marked paid", () => {
    expect(invoiceReferences({
      paymentTransactions: [
        { mode: "upi", amount: 100, referenceNumber: "UPI123" },
        { mode: "bank_transfer", amount: 200, referenceNumber: " NEFT456 " },
      ],
    })).toEqual(["UPI123", "NEFT456"]);
  });

  it("puts the creation reference first and drops blanks and repeats", () => {
    expect(invoiceReferences({
      referenceNumber: "PO-9",
      paymentTransactions: [{ referenceNumber: "" }, { referenceNumber: "PO-9" }, {}],
    })).toEqual(["PO-9"]);
  });

  it("returns nothing for an invoice with no references", () => {
    expect(invoiceReferences({})).toEqual([]);
    expect(invoiceReferences(null)).toEqual([]);
  });
});
