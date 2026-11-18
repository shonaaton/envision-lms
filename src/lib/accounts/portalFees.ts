/**
 * Where a paid portal bill's money went (user, 2026-11-19):
 * - from October 2026, a non-GST bill is paid to Sayantan in cash. Non-GST
 *   bills never collect through Razorpay (lib/payments/gstAccount.ts), so the
 *   payment mode the portal recorded ("UPI", "other") does not change that.
 *   Up to September 2026 the cash sheet is the only record of cash fees: a
 *   bill then is cash only when a payment on it was marked cash or a cash-sheet
 *   line is linked to it, otherwise it went to the bank (user, 2026-11-19 -
 *   counting those bills as cash too doubled the cash sheet's fees);
 * - an export (LUT) bill is paid into the bank through Razorpay;
 * - a GST bill is paid into the bank, unless a payment on it was marked cash.
 *
 * Pure, so the cash book, the bank cross-check, the statement matcher and the
 * Entries list all read the same rule.
 */

import { isExportInvoice } from "@/lib/exportInvoice";
import { isGstInvoice } from "@/lib/feesMetrics";
import { academyMonthOf } from "@/lib/feedback/feedbackCycleDates";

/** First academy month a non-GST bill counts as cash whatever mode was typed. */
export const NON_GST_CASH_FROM = "2026-10";

export type PortalFeeKind = "non_gst" | "export" | "gst";

export function portalFeeKind(invoice: any): PortalFeeKind {
  if (isExportInvoice(invoice)) return "export";
  return isGstInvoice(invoice) ? "gst" : "non_gst";
}

/** The whole bill was paid in cash to Sayantan: a non-GST bill paid from October 2026. */
export function paidInCash(invoice: any) {
  if (portalFeeKind(invoice) !== "non_gst" || !invoice?.paidAt) return false;
  const paidAt = new Date(invoice.paidAt);
  return !Number.isNaN(paidAt.getTime()) && academyMonthOf(paidAt) >= NON_GST_CASH_FROM;
}

/** The fields a query must select for the rule above. */
export const PORTAL_FEE_FIELDS = "invoiceMode gstAmount gstPercentage exportSupply.currency";

/**
 * The cash a paid bill brought in, by the day it was handed over. A non-GST
 * bill paid from October 2026 counts every payment on it (or its total on its
 * paid date when no payment was recorded); any other bill only the payments
 * marked cash.
 */
export function cashReceipts(invoice: any): { amount: number; paidAt: Date }[] {
  const kind = portalFeeKind(invoice);
  if (kind === "export") return [];
  const transactions: any[] = invoice.paymentTransactions || [];
  if (paidInCash(invoice)) {
    if (transactions.length) return transactions.map((transaction) => ({ amount: Number(transaction.amount || 0), paidAt: new Date(transaction.paidAt || invoice.paidAt) }));
    return invoice.paidAt ? [{ amount: Number(invoice.totalAmount || 0), paidAt: new Date(invoice.paidAt) }] : [];
  }
  return transactions.filter((transaction) => transaction.mode === "cash").map((transaction) => ({ amount: Number(transaction.amount || 0), paidAt: new Date(transaction.paidAt) }));
}

/**
 * Rows the Entries list shows for portal bills, beside the typed and imported
 * entries. They are read from Fees every time, never stored, and are already
 * revenue in the overview - they are here so the list shows where the money is.
 */
export const PORTAL_FEE_CATEGORIES = [
  { key: "portal_fee_cash", label: "Portal fee (non-GST, cash)", account: "cash" as const },
  { key: "portal_fee_export", label: "Portal fee (export, LUT)", account: "bank" as const },
];

export function portalFeeCategory(key: string) {
  return PORTAL_FEE_CATEGORIES.find((category) => category.key === key) || null;
}

/**
 * The Entries-list category of a paid bill, or null when it is not listed: a
 * GST bill, or a non-GST bill from before October 2026 (the cash sheet's lines
 * are those months' cash fees).
 */
export function portalFeeCategoryFor(invoice: any) {
  const kind = portalFeeKind(invoice);
  if (paidInCash(invoice)) return PORTAL_FEE_CATEGORIES[0];
  if (kind === "export") return PORTAL_FEE_CATEGORIES[1];
  return null;
}
