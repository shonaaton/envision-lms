/**
 * What moved a student's credits, for the "By" column of the credit ledger.
 *
 * New ledger rows store `source` (and `performedBy` when a person did it).
 * Rows written before that only carry `sourceType`, so `inferCreditSource`
 * works the same answer out from what they do have, plus the payment trail
 * the caller looked up. Both paths end in the same labels.
 */

export const CREDIT_SOURCES = [
  "portal_payment",
  "payment_link",
  "invoice_payment",
  "manual_admin",
  "class_attendance",
  "no_show_ruling",
  "import",
  "system",
] as const;

export type CreditSource = (typeof CREDIT_SOURCES)[number];

export const CREDIT_SOURCE_LABELS: Record<CreditSource, string> = {
  portal_payment: "Online payment (portal)",
  payment_link: "Razorpay payment link",
  invoice_payment: "Invoice payment recorded",
  manual_admin: "Manual adjustment",
  class_attendance: "Automatic - class attendance",
  no_show_ruling: "No-show ruling",
  import: "Data import",
  system: "System",
};

// How the person attached to each source is introduced.
const ACTOR_PREFIX: Record<CreditSource, string> = {
  portal_payment: "Paid by",
  payment_link: "Link by",
  invoice_payment: "Recorded by",
  manual_admin: "By",
  class_attendance: "Attendance marked by",
  no_show_ruling: "Ruled by",
  import: "Imported by",
  system: "By",
};

export function isCreditSource(value: unknown): value is CreditSource {
  return typeof value === "string" && (CREDIT_SOURCES as readonly string[]).includes(value);
}

/** The `source` markInvoicePaid was told about, as a credit source. */
export function creditSourceForPayment(source?: string): CreditSource {
  if (source === "razorpay_checkout" || source === "razorpay_webhook") return "portal_payment";
  if (source === "razorpay_payment_link") return "payment_link";
  if (source === "manual_admin") return "invoice_payment";
  return "system";
}

export function inferCreditSource(
  ledger: { type?: string; sourceType?: string; source?: string; performedBy?: unknown },
  hints: { paymentSource?: string; onlinePayment?: boolean } = {}
): CreditSource {
  if (isCreditSource(ledger.source)) return ledger.source;
  const sourceType = String(ledger.sourceType || "");
  if (sourceType === "manual_credit" || sourceType === "manual_credit_reversal") return "manual_admin";
  if (sourceType === "coach_pay_deduction" || sourceType === "coach_pay_refund") return "no_show_ruling";
  if (sourceType === "LegacyImport") return "import";
  if (ledger.type === "attendance_consumption" || sourceType === "Attendance") return "class_attendance";
  if (ledger.type === "purchase" || sourceType === "Invoice") {
    if (hints.paymentSource) {
      const fromActivity = creditSourceForPayment(hints.paymentSource);
      if (fromActivity !== "system") return fromActivity;
    }
    // Purchased credits only ever arrive through a paid invoice, so without a
    // Razorpay payment behind it someone on staff recorded the payment.
    return hints.onlinePayment ? "portal_payment" : "invoice_payment";
  }
  return ledger.performedBy ? "manual_admin" : "system";
}

function roleLabel(role?: string) {
  if (role === "instructor") return "coach";
  return role || "";
}

export function creditMovementByText(source: CreditSource, actor?: { name?: string; role?: string } | null) {
  const label = CREDIT_SOURCE_LABELS[source];
  const name = String(actor?.name || "").trim();
  if (!name) return { label, actor: "" };
  const role = roleLabel(actor?.role);
  return { label, actor: `${ACTOR_PREFIX[source]} ${name}${role ? ` (${role})` : ""}` };
}
