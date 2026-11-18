/**
 * Where a paid portal bill's money went (user, 2026-11-19):
 * - a non-GST bill is paid to Sayantan in cash. Non-GST bills never collect
 *   through Razorpay (lib/payments/gstAccount.ts), so the payment mode the
 *   portal recorded ("UPI", "other") does not change that;
 * - an export (LUT) bill is paid into the bank through Razorpay;
 * - a GST bill is paid into the bank, unless a payment on it was marked cash.
 *
 * Pure, so the cash book, the bank cross-check, the statement matcher and the
 * Entries list all read the same rule.
 */

import { isExportInvoice } from "@/lib/exportInvoice";
import { isGstInvoice } from "@/lib/feesMetrics";

export type PortalFeeKind = "non_gst" | "export" | "gst";

export function portalFeeKind(invoice: any): PortalFeeKind {
  if (isExportInvoice(invoice)) return "export";
  return isGstInvoice(invoice) ? "gst" : "non_gst";
}

/** The whole bill was paid in cash to Sayantan. */
export function paidInCash(invoice: any) {
  return portalFeeKind(invoice) === "non_gst";
}

/** The fields a query must select for the rule above. */
export const PORTAL_FEE_FIELDS = "invoiceMode gstAmount gstPercentage exportSupply.currency";

/**
 * The cash a paid bill brought in, by the day it was handed over. A non-GST
 * bill counts every payment on it (or its total on its paid date when no
 * payment was recorded); any other bill only the payments marked cash.
 */
export function cashReceipts(invoice: any): { amount: number; paidAt: Date }[] {
  const kind = portalFeeKind(invoice);
  if (kind === "export") return [];
  const transactions: any[] = invoice.paymentTransactions || [];
  if (kind === "non_gst") {
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

/** The Entries-list category of a paid bill, or null for a GST bill (not listed). */
export function portalFeeCategoryFor(invoice: any) {
  const kind = portalFeeKind(invoice);
  if (kind === "non_gst") return PORTAL_FEE_CATEGORIES[0];
  if (kind === "export") return PORTAL_FEE_CATEGORIES[1];
  return null;
}
