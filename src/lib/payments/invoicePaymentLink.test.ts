import { describe, expect, it, vi } from "vitest";

vi.mock("@/models/Fee", () => ({ Invoice: {} }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));

import { decideInvoiceLinkAction } from "./invoicePaymentLink";

const active = (amount: number) => ({ id: "plink_1", shortUrl: "https://rzp.io/rzp/a", amount, status: "active" });
const gst = { invoiceMode: "included", gstPercentage: 18 };

describe("decideInvoiceLinkAction", () => {
  it("makes a link for an unpaid invoice that has none", () => {
    expect(decideInvoiceLinkAction({ ...gst, status: "unpaid", totalAmount: 250000 })).toBe("create");
  });

  it("reuses the link while the total is unchanged", () => {
    expect(decideInvoiceLinkAction({ ...gst, status: "overdue", totalAmount: 250000, razorpayLink: active(250000) })).toBe("reuse");
  });

  it("replaces the link once a late fee changes the total", () => {
    expect(decideInvoiceLinkAction({ ...gst, status: "overdue", totalAmount: 300000, razorpayLink: active(250000) })).toBe("replace");
  });

  it("makes a new link when the old one was cancelled or paid", () => {
    expect(decideInvoiceLinkAction({ ...gst, status: "unpaid", totalAmount: 250000, razorpayLink: { ...active(250000), status: "cancelled" } })).toBe("create");
  });

  it("does nothing for paid, cancelled, draft or zero invoices", () => {
    for (const status of ["paid", "cancelled", "draft"]) {
      expect(decideInvoiceLinkAction({ ...gst, status, totalAmount: 250000, razorpayLink: active(250000) })).toBe("none");
    }
    expect(decideInvoiceLinkAction({ ...gst, status: "unpaid", totalAmount: 0 })).toBe("none");
  });

  it("never makes a link for a non-GST invoice, which is paid into the other account", () => {
    expect(decideInvoiceLinkAction({ status: "unpaid", totalAmount: 250000, invoiceMode: "non_gst", gstPercentage: 0 })).toBe("none");
    expect(decideInvoiceLinkAction({ status: "overdue", totalAmount: 250000, invoiceMode: "included", gstPercentage: 0 })).toBe("none");
    expect(decideInvoiceLinkAction({ status: "unpaid", totalAmount: 250000, invoiceMode: "excluded", gstPercentage: 18 })).toBe("create");
  });
});
