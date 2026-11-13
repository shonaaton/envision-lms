// Export of services under a Letter of Undertaking (LUT): a foreign client is
// billed in their own currency with no GST (zero-rated, CGST Rule 96A).
//
// The invoice's own amount fields (amount, totalAmount, payments) stay in INR
// paise, converted at the rate the admin enters, so every report, the accounts
// dashboard and payment recording keep adding up rupees. The foreign currency
// figures live beside them in `exportSupply` and are what the PDF prints.

import { formatINR } from "@/lib/utils";

/** Two-decimal currencies only: amounts are stored in 1/100 units like paise. */
export const EXPORT_CURRENCIES = [
  { code: "USD", name: "US dollar" },
  { code: "GBP", name: "British pound" },
  { code: "EUR", name: "Euro" },
  { code: "AUD", name: "Australian dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "QAR", name: "Qatari riyal" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "ZAR", name: "South African rand" },
] as const;

export type ExportCurrency = (typeof EXPORT_CURRENCIES)[number]["code"];

export const LUT_ENDORSEMENT = "SUPPLY MEANT FOR EXPORT UNDER LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX";

export type ExportSupply = {
  currency: string;
  /** Foreign amount in 1/100 units (cents, pence). */
  foreignAmount: number;
  /** Rupees for one unit of the foreign currency. */
  exchangeRate: number;
  country: string;
  address?: string;
  lutArn: string;
  /** yyyy-mm-dd the LUT was filed. */
  lutFiledOn?: string;
};

export function isExportCurrency(code: string): code is ExportCurrency {
  return EXPORT_CURRENCIES.some((item) => item.code === code);
}

export function isExportInvoice(invoice: any): boolean {
  return Boolean(invoice?.exportSupply?.currency);
}

/** INR paise for a foreign amount in 1/100 units at `rate` rupees per unit. */
export function inrPaiseFor(foreignMinor: number, rate: number) {
  if (!Number.isFinite(foreignMinor) || !Number.isFinite(rate) || foreignMinor <= 0 || rate <= 0) return 0;
  return Math.round(foreignMinor * rate);
}

/** "USD 225.00": ISO codes rather than symbols, so the PDF's built-in fonts can print every currency. */
export function formatForeign(minor: number, currency: string) {
  const value = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(minor || 0) / 100);
  return `${currency} ${value}`;
}

/**
 * The foreign total of an export invoice. Normally the amount it was raised
 * for; when the rupee total was adjusted later (a discount on payment), the
 * adjusted rupees converted back at the invoice's own rate.
 */
export function exportForeignTotal(invoice: any) {
  const exp = invoice?.exportSupply;
  if (!exp?.currency) return 0;
  const rate = Number(exp.exchangeRate || 0);
  const total = Number(invoice.totalAmount || 0);
  if (!rate || total === Number(invoice.amount || 0)) return Number(exp.foreignAmount || 0);
  return Math.round(total / rate);
}

/** The total as the client reads it: "USD 225.00" for an export invoice, rupees otherwise. */
export function invoiceAmountLabel(invoice: any) {
  if (isExportInvoice(invoice)) return formatForeign(exportForeignTotal(invoice), invoice.exportSupply.currency);
  return formatINR(Number(invoice?.totalAmount || 0));
}

/**
 * The last day an LUT filed on `filedOn` covers: 31 March closing the Indian
 * financial year it was filed in. Null when the date can't be read.
 */
export function lutValidUntil(filedOn?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(filedOn || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${month >= 4 ? year + 1 : year}-03-31`;
}

/**
 * Whether an invoice dated `invoiceDate` (yyyy-mm-dd) falls inside the LUT's
 * cover: on or after the filing date and no later than that financial year's end.
 */
export function lutCovers(invoiceDate: string, filedOn?: string | null) {
  const until = lutValidUntil(filedOn);
  if (!until || !filedOn) return true;
  return invoiceDate >= filedOn && invoiceDate <= until;
}

/** "10 Nov 2026" from "2026-11-10". */
export function lutDateLabel(value?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return String(value || "");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/* ------------------------------------------------- plans and payment links */

/** A fee plan priced in a foreign currency. plan.amount stays INR paise at exchangeRate. */
export type ExportPricing = { currency: string; foreignAmount: number; exchangeRate: number };

export function isExportPlan(plan: any): boolean {
  return Boolean(plan?.exportPricing?.currency);
}

/** Any amount in 1/100 units of `currency`: rupees as ₹, everything else as "USD 225.00". */
export function moneyIn(minor: number, currency?: string | null) {
  const code = String(currency || "INR").toUpperCase();
  return code === "INR" ? formatINR(Number(minor || 0)) : formatForeign(Number(minor || 0), code);
}

/**
 * The client's country for an export invoice: the student's own country, else
 * the one their phone code points to, else "Outside India". A shared code such
 * as +1 (United States / Canada) is not a country, so it is not used.
 */
export function exportCountryFor(student: { country?: unknown; countryCode?: unknown } | null | undefined, dialCountry?: string | null) {
  const own = String(student?.country || "").trim();
  if (own && !/^india$/i.test(own)) return own;
  const fromDial = String(dialCountry || "").trim();
  if (fromDial && !fromDial.includes("/") && !/^india$/i.test(fromDial)) return fromDial;
  return "Outside India";
}

/**
 * The export details for an invoice raised from a foreign-priced plan. The
 * plan's own price is used as is; any other INR amount (a pro-rated or
 * adjusted bill) is converted back at the plan's rate.
 */
export function exportSupplyFromPlan(
  plan: { amount?: number; exportPricing?: ExportPricing | null },
  amountPaise: number,
  country: string,
  lut: { lutArn?: string; lutFiledOn?: string },
): ExportSupply | undefined {
  const pricing = plan?.exportPricing;
  if (!pricing?.currency || !(Number(pricing.exchangeRate) > 0)) return undefined;
  const foreignAmount = Number(amountPaise) === Number(plan.amount)
    ? Number(pricing.foreignAmount)
    : Math.round(Number(amountPaise) / Number(pricing.exchangeRate));
  return {
    currency: pricing.currency,
    foreignAmount,
    exchangeRate: Number(pricing.exchangeRate),
    country: country || "Outside India",
    lutArn: String(lut.lutArn || ""),
    lutFiledOn: lut.lutFiledOn || undefined,
  };
}

/** What a Razorpay link for this invoice must collect: the foreign total for an export invoice, rupees otherwise. */
export function invoiceLinkAmount(invoice: any): { amount: number; currency: string } {
  if (isExportInvoice(invoice)) return { amount: exportForeignTotal(invoice), currency: String(invoice.exportSupply.currency) };
  return { amount: Number(invoice?.totalAmount || 0), currency: "INR" };
}

/**
 * Rupees (paise) Razorpay converted a payment into. For a non-INR payment the
 * payment entity carries base_amount in base_currency (INR), which is what
 * settles and what Razorpay's fee is worked out on. Null when the payment does
 * not say (an INR payment, or an older payload): the caller decides then.
 */
export function razorpayInrAmount(payment: { amount?: unknown; currency?: unknown; base_amount?: unknown; base_currency?: unknown } | null | undefined) {
  const currency = String(payment?.currency || "INR").toUpperCase();
  if (currency === "INR") {
    const amount = Number(payment?.amount);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
  }
  const base = Number(payment?.base_amount);
  const baseCurrency = String(payment?.base_currency || "INR").toUpperCase();
  return baseCurrency === "INR" && Number.isFinite(base) && base > 0 ? Math.round(base) : null;
}

/** Rupees per unit, to 4 places, from a foreign amount and the INR it became. */
export function impliedRate(foreignMinor: number, inrPaise: number) {
  if (!(foreignMinor > 0) || !(inrPaise > 0)) return 0;
  return Math.round((inrPaise / foreignMinor) * 10000) / 10000;
}
