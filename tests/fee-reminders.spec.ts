import { expect, test } from "@playwright/test";
import {
  academyCalendarDayDifference,
  creditReminderCategory,
  feeReminderWhatsAppTemplate,
  feeReminderRetryTargets,
  invoiceReminderCategory,
  invoiceTimingLabel,
  isCreditReminderAssignment,
  isInvoiceReminderRecord,
  resolveFeeReminderContact,
  summarizeReminderDeliveryResults,
} from "../src/lib/feeReminderRules";

test.describe("credit fee reminder classification", () => {
  test("positive low balance uses the configured threshold", () => {
    expect(creditReminderCategory(2, 2)).toBe("credit_low");
    expect(creditReminderCategory(3, 2)).toBeNull();
  });

  test("zero is final-class allowance and is never blocked", () => {
    expect(creditReminderCategory(0, 2)).toBe("credit_zero");
    expect(creditReminderCategory(0, 0)).toBe("credit_zero");
  });

  test("minus one and lower are blocked", () => {
    expect(creditReminderCategory(-1, 2)).toBe("credit_blocked");
    expect(creditReminderCategory(-5, 2)).toBe("credit_blocked");
  });

  test("only authoritative credit assignments enter credit reminders", () => {
    expect(isCreditReminderAssignment({ type: "credits" })).toBe(true);
    expect(isCreditReminderAssignment({ type: "monthly" })).toBe(false);
    expect(isCreditReminderAssignment({ type: "monthly", creditBalance: 1 } as any)).toBe(false);
  });
});

test.describe("invoice fee reminder classification in Asia/Kolkata", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  test("due in 7 days and due today are upcoming", () => {
    expect(invoiceReminderCategory("unpaid", "2026-09-12", now)).toBe("invoice_upcoming");
    expect(invoiceReminderCategory("unpaid", "2026-09-05", now)).toBe("invoice_upcoming");
    expect(invoiceTimingLabel(7)).toBe("Due in 7 days");
    expect(invoiceTimingLabel(0)).toBe("Due today");
  });

  test("due in 8 days is excluded", () => {
    expect(invoiceReminderCategory("unpaid", "2026-09-13", now)).toBeNull();
  });

  test("overdue unpaid invoice is separate", () => {
    expect(invoiceReminderCategory("unpaid", "2026-09-04", now)).toBe("invoice_overdue");
    expect(invoiceReminderCategory("overdue", "2026-09-02", now)).toBe("invoice_overdue");
    expect(invoiceTimingLabel(-3)).toBe("Overdue by 3 days");
  });

  test("paid, cancelled, draft, and credit-recharge invoices are not candidates", () => {
    for (const status of ["paid", "cancelled", "draft"]) {
      expect(invoiceReminderCategory(status, "2026-09-05", now)).toBeNull();
      expect(isInvoiceReminderRecord({ type: "monthly", status })).toBe(false);
    }
    expect(isInvoiceReminderRecord({ type: "credits", status: "unpaid" })).toBe(false);
    expect(isInvoiceReminderRecord({ type: "monthly", status: "unpaid" })).toBe(true);
    expect(isInvoiceReminderRecord({ type: "manual", status: "overdue" })).toBe(true);
  });

  test("midnight IST classification does not follow the UTC calendar day", () => {
    const afterMidnightIst = new Date("2026-09-05T19:45:00.000Z"); // 6 Sep, 1:15 AM IST
    expect(academyCalendarDayDifference("2026-09-06", afterMidnightIst)).toBe(0);
    expect(invoiceReminderCategory("unpaid", "2026-09-06", afterMidnightIst)).toBe("invoice_upcoming");
    expect(invoiceReminderCategory("unpaid", "2026-09-05", afterMidnightIst)).toBe("invoice_overdue");
  });
});

test.describe("fee reminder contact and channel delivery", () => {
  test("parent payer identity is preferred for fee communication", () => {
    expect(resolveFeeReminderContact({ name: "Student", email: "student@example.com", parentName: "Parent", parentEmail: "parent@example.com", phone: "+91 99999 00000", countryCode: "91" })).toMatchObject({
      contactName: "Parent",
      studentName: "Student",
      email: "parent@example.com",
      emailSource: "parent",
      phone: "+91 99999 00000",
    });
  });

  test("missing email still leaves WhatsApp available and vice versa", () => {
    expect(resolveFeeReminderContact({ name: "Phone Only", email: "", phone: "9999900000" })).toMatchObject({ email: "", phone: "9999900000" });
    expect(resolveFeeReminderContact({ name: "Email Only", email: "email@example.com", phone: "" })).toMatchObject({ email: "email@example.com", phone: "" });
    expect(resolveFeeReminderContact({ name: "No Contact", email: "", phone: "" })).toMatchObject({ email: "", phone: "" });
  });

  test("Email + WhatsApp results remain independent, including unavailable contacts", () => {
    const summary = summarizeReminderDeliveryResults([
      { channel: "email", status: "sent" },
      { channel: "whatsapp", status: "failed" },
      { channel: "email", status: "unavailable" },
      { channel: "whatsapp", status: "sent" },
      { channel: "email", status: "not_configured" },
      { channel: "whatsapp", status: "unavailable" },
    ]);
    expect(summary).toEqual({
      email: { sent: 1, failed: 0, unavailable: 1, not_configured: 1 },
      whatsapp: { sent: 1, failed: 1, unavailable: 1, not_configured: 0 },
    });
  });

  test("each business state maps to a dedicated Meta template", () => {
    expect(feeReminderWhatsAppTemplate("credit_low")).toBe("fee_credit_low_reminder");
    expect(feeReminderWhatsAppTemplate("credit_zero")).toBe("fee_credit_zero_final_class");
    expect(feeReminderWhatsAppTemplate("credit_blocked")).toBe("fee_credit_blocked");
    expect(feeReminderWhatsAppTemplate("invoice_upcoming")).toBe("fee_invoice_upcoming_reminder");
    expect(feeReminderWhatsAppTemplate("invoice_overdue")).toBe("fee_invoice_overdue_reminder");
  });

  test("failed-only retry never resends a successful channel", () => {
    expect(feeReminderRetryTargets([
      { recipientId: "student-a", channel: "email", status: "sent" },
      { recipientId: "student-a", channel: "whatsapp", status: "failed" },
      { recipientId: "student-b", channel: "email", status: "not_configured" },
      { recipientId: "student-b", channel: "whatsapp", status: "sent" },
      { recipientId: "student-c", channel: "email", status: "unavailable" },
    ])).toEqual({ email: ["student-b"], whatsapp: ["student-a"] });
  });
});
