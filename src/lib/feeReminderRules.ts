import { academyDateKey } from "@/lib/academyTime";

export type FeeReminderType =
  | "credit_low"
  | "credit_zero"
  | "credit_blocked"
  | "invoice_upcoming"
  | "invoice_overdue"
  | "all_credit"
  | "all_invoice";

export type CreditReminderCategory = "credit_low" | "credit_zero" | "credit_blocked" | null;
export type InvoiceReminderCategory = "invoice_upcoming" | "invoice_overdue" | null;

export const COLLECTABLE_INVOICE_STATUSES = ["unpaid", "overdue"] as const;

export function isCreditReminderAssignment(assignment: { type?: string }) {
  return assignment.type === "credits";
}

export function isInvoiceReminderRecord(invoice: { type?: string; status?: string }) {
  return invoice.type !== "credits" && COLLECTABLE_INVOICE_STATUSES.includes(invoice.status as (typeof COLLECTABLE_INVOICE_STATUSES)[number]);
}

function calendarOrdinal(value: string | Date) {
  const [year, month, day] = academyDateKey(value).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function academyCalendarDayDifference(dueDate: string | Date, now: string | Date) {
  return calendarOrdinal(dueDate) - calendarOrdinal(now);
}

export function creditReminderCategory(balance: number, lowCreditThreshold: number): CreditReminderCategory {
  if (balance <= -1) return "credit_blocked";
  if (balance === 0) return "credit_zero";
  if (balance > 0 && balance <= Math.max(0, lowCreditThreshold)) return "credit_low";
  return null;
}

export function invoiceReminderCategory(
  status: string,
  dueDate: string | Date,
  now: string | Date
): InvoiceReminderCategory {
  if (!COLLECTABLE_INVOICE_STATUSES.includes(status as (typeof COLLECTABLE_INVOICE_STATUSES)[number])) return null;
  const days = academyCalendarDayDifference(dueDate, now);
  if (days < 0) return "invoice_overdue";
  if (days <= 7) return "invoice_upcoming";
  return null;
}

export function reminderTypeMatches(type: FeeReminderType, category: CreditReminderCategory | InvoiceReminderCategory) {
  if (!category) return false;
  if (type === "all_credit") return category.startsWith("credit_");
  if (type === "all_invoice") return category.startsWith("invoice_");
  return type === category;
}

export function invoiceTimingLabel(daysUntilDue: number) {
  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue > 0) return `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
  const overdueDays = Math.abs(daysUntilDue);
  return `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`;
}

export function resolveFeeReminderContact(student: any) {
  const parentName = String(student?.parentName || "").trim();
  const parentEmail = String(student?.parentEmail || "").trim().toLowerCase();
  const studentName = String(student?.name || student?.username || "Student").trim();
  const studentEmail = String(student?.email || "").trim().toLowerCase();
  return {
    contactName: parentName || studentName,
    parentName,
    email: parentEmail || studentEmail,
    emailSource: parentEmail ? "parent" as const : studentEmail ? "student" as const : "missing" as const,
    phone: String(student?.phone || "").trim(),
    countryCode: String(student?.countryCode || "").trim(),
    studentName,
  };
}

export function feeReminderWhatsAppTemplate(category: Exclude<FeeReminderType, "all_credit" | "all_invoice">) {
  const templates = {
    credit_low: "fee_credit_low_reminder",
    credit_zero: "fee_credit_zero_final_class",
    credit_blocked: "fee_credit_blocked",
    invoice_upcoming: "fee_invoice_upcoming_reminder",
    invoice_overdue: "fee_invoice_overdue_reminder",
  } as const;
  return templates[category];
}

export function summarizeReminderDeliveryResults(results: Array<{ channel: "email" | "whatsapp"; status: "sent" | "failed" | "unavailable" | "not_configured" }>) {
  const empty = { sent: 0, failed: 0, unavailable: 0, not_configured: 0 };
  return results.reduce(
    (summary, result) => {
      summary[result.channel][result.status] += 1;
      return summary;
    },
    { email: { ...empty }, whatsapp: { ...empty } }
  );
}

export function feeReminderRetryTargets(results: Array<{ recipientId: string; channel: "email" | "whatsapp"; status: "sent" | "failed" | "unavailable" | "not_configured" }>) {
  const retryable = results.filter((result) => result.status === "failed" || result.status === "not_configured");
  return {
    email: Array.from(new Set(retryable.filter((result) => result.channel === "email").map((result) => result.recipientId))),
    whatsapp: Array.from(new Set(retryable.filter((result) => result.channel === "whatsapp").map((result) => result.recipientId))),
  };
}
