import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentExists: vi.fn(),
  paymentCreate: vi.fn(),
  invoiceFindById: vi.fn(),
  invoiceUpdateOne: vi.fn(),
  salesFindOneAndUpdate: vi.fn(),
  salesUpdateOne: vi.fn(),
  notificationInsertMany: vi.fn(),
  markInvoicePaid: vi.fn(),
  recordActivity: vi.fn(),
  invoiceStaff: vi.fn(),
  recordOnAccount: vi.fn(),
}));

vi.mock("@/models/Payment", () => ({ Payment: { exists: mocks.paymentExists, create: mocks.paymentCreate } }));
vi.mock("@/models/Fee", () => ({
  Invoice: { findById: mocks.invoiceFindById, updateOne: mocks.invoiceUpdateOne },
  Notification: { insertMany: mocks.notificationInsertMany },
}));
vi.mock("@/models/SalesPaymentLink", () => ({ SalesPaymentLink: { findOneAndUpdate: mocks.salesFindOneAndUpdate, updateOne: mocks.salesUpdateOne } }));
vi.mock("@/lib/fees", () => ({ markInvoicePaid: mocks.markInvoicePaid }));
vi.mock("@/lib/activity", () => ({ recordActivity: mocks.recordActivity }));
vi.mock("@/lib/demoNotificationRecipients", () => ({ invoiceStaffRecipients: mocks.invoiceStaff }));
vi.mock("@/lib/payments/salesPaymentLinks", () => ({ recordPaidLinkOnAccount: mocks.recordOnAccount }));

import { handlePaymentLinkClosed, handlePaymentLinkPaid } from "./paymentLinkWebhook";

const INVOICE = "aaaaaaaaaaaaaaaaaaaaaaa1";
const SALES_LINK = "bbbbbbbbbbbbbbbbbbbbbbb1";
const SALESPERSON = "ccccccccccccccccccccccc1";
const STAFF = "ccccccccccccccccccccccc2";
const lean = (value: unknown) => ({ lean: () => Promise.resolve(value) });
const payment = { id: "pay_1", order_id: "order_1", method: "upi", amount: 250000 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paymentCreate.mockResolvedValue({ _id: "payment1" });
  mocks.invoiceStaff.mockResolvedValue([{ userId: STAFF }, { userId: SALESPERSON }]);
  mocks.notificationInsertMany.mockResolvedValue([]);
});

describe("payment_link.paid for an invoice", () => {
  const link = { id: "plink_1", amount_paid: 250000, notes: { kind: "invoice", invoiceId: INVOICE } };
  const invoice = (status: string) => ({ _id: INVOICE, student: "s1", invoiceNumber: "ENV/26-27/010", status, totalAmount: 250000 });

  it("records the payment and marks the invoice paid once", async () => {
    mocks.paymentExists.mockResolvedValue(null);
    mocks.invoiceFindById.mockReturnValue(lean(invoice("overdue")));
    expect(await handlePaymentLinkPaid(link, payment)).toEqual({ handled: true });
    expect(mocks.paymentCreate).toHaveBeenCalledWith(expect.objectContaining({ purpose: "invoice", amount: 250000, razorpayPaymentId: "pay_1", method: "upi", status: "paid" }));
    expect(mocks.markInvoicePaid).toHaveBeenCalledTimes(1);
    expect(mocks.markInvoicePaid).toHaveBeenCalledWith(INVOICE, "payment1", expect.objectContaining({ source: "razorpay_payment_link" }));
  });

  it("ignores a replayed event", async () => {
    mocks.paymentExists.mockResolvedValue({ _id: "payment1" });
    expect(await handlePaymentLinkPaid(link, payment)).toMatchObject({ duplicate: true });
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
    expect(mocks.markInvoicePaid).not.toHaveBeenCalled();
  });

  it("records but does not re-mark an invoice already settled another way", async () => {
    mocks.paymentExists.mockResolvedValue(null);
    mocks.invoiceFindById.mockReturnValue(lean(invoice("paid")));
    expect(await handlePaymentLinkPaid(link, payment)).toMatchObject({ alreadyPaid: true });
    expect(mocks.paymentCreate).toHaveBeenCalled();
    expect(mocks.markInvoicePaid).not.toHaveBeenCalled();
  });
});

describe("payment_link.paid for a sales link", () => {
  const link = { id: "plink_2", amount_paid: 400000, notes: { kind: "sales_link", salesLinkId: SALES_LINK } };

  it("marks the link paid and tells the salesperson and invoice staff, once each", async () => {
    mocks.salesFindOneAndUpdate.mockReturnValue(lean({ _id: SALES_LINK, createdBy: SALESPERSON, customerName: "Mr. Sharma", description: "Group classes", amount: 400000, amountPaid: 400000 }));
    expect(await handlePaymentLinkPaid(link, payment)).toEqual({ handled: true, recordedAs: undefined });
    expect(mocks.recordOnAccount).not.toHaveBeenCalled();
    const [filter, update] = mocks.salesFindOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: SALES_LINK, razorpayPaymentId: { $exists: false } });
    expect(update.$set).toMatchObject({ status: "paid", amountPaid: 400000, razorpayPaymentId: "pay_1" });
    const notified = mocks.notificationInsertMany.mock.calls[0][0].map((row: any) => row.user);
    expect(notified.sort()).toEqual([SALESPERSON, STAFF].sort());
  });

  it("records the payment on the demo account the link was sent for", async () => {
    const ACCOUNT = "ddddddddddddddddddddddd1";
    mocks.salesFindOneAndUpdate.mockReturnValue(lean({ _id: SALES_LINK, account: ACCOUNT, createdBy: SALESPERSON, customerName: "Mr. Sharma", description: "Group classes", amount: 400000, amountPaid: 400000 }));
    mocks.recordOnAccount.mockResolvedValue({ invoiceNumber: "ENV/26-27/050", studentName: "Aarav Sharma" });
    expect(await handlePaymentLinkPaid(link, payment)).toEqual({ handled: true, recordedAs: "ENV/26-27/050" });
    expect(mocks.recordOnAccount).toHaveBeenCalledWith(SALES_LINK);
    expect(mocks.notificationInsertMany.mock.calls[0][0][0].message).toContain("Recorded on Aarav Sharma's account as ENV/26-27/050.");
  });

  it("asks for a manual attach when recording on the demo account fails", async () => {
    mocks.salesFindOneAndUpdate.mockReturnValue(lean({ _id: SALES_LINK, account: "ddddddddddddddddddddddd1", createdBy: SALESPERSON, customerName: "Mr. Sharma", description: "Group classes", amount: 400000, amountPaid: 400000 }));
    mocks.recordOnAccount.mockResolvedValue(null);
    await handlePaymentLinkPaid(link, payment);
    expect(mocks.notificationInsertMany.mock.calls[0][0][0].message).toContain("attach it by hand");
  });

  it("ignores a replayed event", async () => {
    mocks.salesFindOneAndUpdate.mockReturnValue(lean(null));
    expect(await handlePaymentLinkPaid(link, payment)).toMatchObject({ duplicate: true });
    expect(mocks.notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe("payment_link.cancelled / expired", () => {
  it("closes only an open sales link", async () => {
    await handlePaymentLinkClosed({ id: "plink_2", notes: { kind: "sales_link", salesLinkId: SALES_LINK } }, "expired");
    expect(mocks.salesUpdateOne).toHaveBeenCalledWith({ razorpayLinkId: "plink_2", status: "created" }, { $set: { status: "expired" } });
  });

  it("marks an invoice's active link cancelled", async () => {
    await handlePaymentLinkClosed({ id: "plink_1", notes: { kind: "invoice", invoiceId: INVOICE } }, "cancelled");
    expect(mocks.invoiceUpdateOne).toHaveBeenCalledWith({ "razorpayLink.id": "plink_1", "razorpayLink.status": "active" }, { $set: { "razorpayLink.status": "cancelled" } });
  });
});
