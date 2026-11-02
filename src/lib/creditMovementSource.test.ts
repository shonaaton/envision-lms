import { describe, expect, it } from "vitest";
import { creditMovementByText, creditSourceForPayment, inferCreditSource } from "@/lib/creditMovementSource";

describe("inferCreditSource", () => {
  it("trusts a stored source", () => {
    expect(inferCreditSource({ type: "purchase", sourceType: "Invoice", source: "payment_link" })).toBe("payment_link");
  });

  it("explains old rows from their sourceType", () => {
    expect(inferCreditSource({ type: "adjustment", sourceType: "manual_credit" })).toBe("manual_admin");
    expect(inferCreditSource({ type: "adjustment", sourceType: "manual_credit_reversal" })).toBe("manual_admin");
    expect(inferCreditSource({ type: "adjustment", sourceType: "coach_pay_refund" })).toBe("no_show_ruling");
    expect(inferCreditSource({ type: "attendance_consumption", sourceType: "Attendance" })).toBe("class_attendance");
    expect(inferCreditSource({ type: "adjustment", sourceType: "LegacyImport" })).toBe("import");
  });

  it("tells a portal payment from a staff-recorded one", () => {
    expect(inferCreditSource({ type: "purchase", sourceType: "Invoice" }, { paymentSource: "razorpay_checkout" })).toBe("portal_payment");
    expect(inferCreditSource({ type: "purchase", sourceType: "Invoice" }, { paymentSource: "razorpay_webhook" })).toBe("portal_payment");
    expect(inferCreditSource({ type: "purchase", sourceType: "Invoice" }, { paymentSource: "manual_admin" })).toBe("invoice_payment");
    // No activity trail: a Razorpay payment id on the invoice's Payment decides it.
    expect(inferCreditSource({ type: "purchase", sourceType: "Invoice" }, { paymentSource: "backend", onlinePayment: true })).toBe("portal_payment");
    expect(inferCreditSource({ type: "purchase", sourceType: "Invoice" })).toBe("invoice_payment");
  });
});

describe("creditSourceForPayment", () => {
  it("maps markInvoicePaid sources", () => {
    expect(creditSourceForPayment("razorpay_payment_link")).toBe("payment_link");
    expect(creditSourceForPayment(undefined)).toBe("system");
  });
});

describe("creditMovementByText", () => {
  it("names the person and their role", () => {
    expect(creditMovementByText("invoice_payment", { name: "Ritu", role: "sub-admin" })).toEqual({
      label: "Invoice payment recorded",
      actor: "Recorded by Ritu (sub-admin)",
    });
    expect(creditMovementByText("class_attendance", { name: "Arjun", role: "instructor" }).actor).toBe("Attendance marked by Arjun (coach)");
    expect(creditMovementByText("system", null)).toEqual({ label: "System", actor: "" });
  });
});
