import "server-only";
import { Payment } from "@/models/Payment";
import { SalesPaymentLink } from "@/models/SalesPaymentLink";
import { User } from "@/models/User";
import { razorpayChargeFields, razorpayConfigured, rzp } from "@/lib/payments/razorpay";
import type { DetailTable } from "@/lib/feesAnalyticsTypes";

export type RazorpayChargeRow = {
  paidAt: Date;
  payer: string;
  reference: string;
  method: string;
  razorpayPaymentId: string;
  amount: number;
  fee?: number;
  tax?: number;
};

/**
 * Every payment that came in through Razorpay (portal checkout, invoice links,
 * sales links) paid inside the range, once per Razorpay payment id. A sales
 * link is listed from its own record until it is attached and has a Payment.
 */
export async function razorpayChargeRows(from: Date, to: Date): Promise<RazorpayChargeRow[]> {
  const [payments, links]: any[][] = await Promise.all([
    Payment.find({ razorpayPaymentId: { $nin: [null, ""] }, status: { $in: ["paid", "refunded"] }, paidAt: { $gte: from, $lte: to } })
      .select("user invoiceNumber purpose method amount paidAt razorpayPaymentId razorpayFee razorpayTax")
      .lean(),
    SalesPaymentLink.find({ status: "paid", razorpayPaymentId: { $nin: [null, ""] }, paidAt: { $gte: from, $lte: to } })
      .select("customerName description method amount amountPaid paidAt razorpayPaymentId razorpayFee razorpayTax")
      .lean(),
  ]);
  const users: any[] = await User.find({ _id: { $in: Array.from(new Set(payments.map((payment) => String(payment.user)))) } }).select("name").lean();
  const names = new Map(users.map((user) => [String(user._id), user.name]));

  const rows = new Map<string, RazorpayChargeRow>();
  for (const payment of payments) {
    if (rows.has(payment.razorpayPaymentId)) continue;
    rows.set(payment.razorpayPaymentId, {
      paidAt: payment.paidAt,
      payer: names.get(String(payment.user)) || "-",
      reference: payment.invoiceNumber || payment.purpose,
      method: payment.method || "other",
      razorpayPaymentId: payment.razorpayPaymentId,
      amount: Number(payment.amount || 0),
      fee: payment.razorpayFee ?? undefined,
      tax: payment.razorpayTax ?? undefined,
    });
  }
  for (const link of links) {
    if (rows.has(link.razorpayPaymentId)) continue;
    rows.set(link.razorpayPaymentId, {
      paidAt: link.paidAt,
      payer: link.customerName,
      reference: `Sales link: ${link.description}`,
      method: link.method || "other",
      razorpayPaymentId: link.razorpayPaymentId,
      amount: Number(link.amountPaid || link.amount || 0),
      fee: link.razorpayFee ?? undefined,
      tax: link.razorpayTax ?? undefined,
    });
  }
  return Array.from(rows.values()).sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
}

/** Fee as a percentage of the amount paid, to two decimals. */
function feeRate(fee: number, amount: number) {
  return amount ? Math.round((fee / amount) * 10000) / 100 : 0;
}

export function razorpayChargeSummary(rows: RazorpayChargeRow[], rangeLabel: string) {
  const known = rows.filter((row) => row.fee !== undefined);
  const gross = rows.reduce((total, row) => total + row.amount, 0);
  const knownGross = known.reduce((total, row) => total + row.amount, 0);
  const fee = known.reduce((total, row) => total + (row.fee || 0), 0);
  const tax = known.reduce((total, row) => total + (row.tax || 0), 0);

  const kpis = {
    razorpayGross: gross,
    razorpayPayments: rows.length,
    razorpayFee: fee,
    razorpayFeeTax: tax,
    razorpayFeeExTax: fee - tax,
    // Only payments whose fee is known, so a missing fee never reads as zero commission.
    razorpaySettled: knownGross - fee,
    razorpayFeeRate: feeRate(fee, knownGross),
    razorpayFeeMissing: rows.length - known.length,
  };

  const table: DetailTable = {
    id: "razorpayCharges",
    title: "Razorpay commission",
    subtitle: `Payments received through Razorpay between ${rangeLabel}, and what Razorpay kept from each`,
    columns: [
      { key: "paidAt", label: "Paid", type: "datetime" },
      { key: "payer", label: "Paid by" },
      { key: "reference", label: "For" },
      { key: "method", label: "Method", type: "badge" },
      { key: "razorpayPaymentId", label: "Razorpay payment" },
      { key: "amount", label: "Amount paid", type: "money", align: "right" },
      { key: "feeExTax", label: "Razorpay fee", type: "money", align: "right" },
      { key: "tax", label: "GST on fee", type: "money", align: "right" },
      { key: "fee", label: "Total deducted", type: "money", align: "right" },
      { key: "settled", label: "Settled to bank", type: "money", align: "right" },
      { key: "rate", label: "Rate", type: "percent", align: "right" },
    ],
    rows: rows.map((row) => {
      const known = row.fee !== undefined;
      return {
        paidAt: row.paidAt,
        payer: row.payer,
        reference: row.reference,
        method: row.method,
        razorpayPaymentId: row.razorpayPaymentId,
        amount: row.amount,
        feeExTax: known ? (row.fee || 0) - (row.tax || 0) : null,
        tax: known ? row.tax || 0 : null,
        fee: known ? row.fee : null,
        settled: known ? row.amount - (row.fee || 0) : null,
        rate: known ? feeRate(row.fee || 0, row.amount) : null,
      };
    }),
    totals: { amount: gross, feeExTax: fee - tax, tax, fee, settled: knownGross - fee },
    footnote:
      "Total deducted is what Razorpay keeps before settling: its fee plus 18% GST on that fee. That GST can usually be claimed as input tax credit. A blank fee means Razorpay has not reported it to the LMS yet - use Fetch missing fees on the dashboard. Totals for settled and the rate count only payments whose fee is known.",
  };

  return { kpis, table };
}

/**
 * Fills in the fee for Razorpay payments recorded without one: everything paid
 * before fees were captured, and any payment whose webhook carried no fee.
 */
export async function syncMissingRazorpayFees(limit = 100) {
  if (!razorpayConfigured()) return { configured: false, checked: 0, updated: 0, failed: 0, remaining: 0 };
  const missing = { razorpayPaymentId: { $nin: [null, ""] }, razorpayFee: { $exists: false } };
  const [paymentIds, linkIds] = await Promise.all([
    Payment.distinct("razorpayPaymentId", { ...missing, status: { $in: ["paid", "refunded"] } }),
    SalesPaymentLink.distinct("razorpayPaymentId", { ...missing, status: "paid" }),
  ]);
  const ids = Array.from(new Set([...paymentIds, ...linkIds].map(String)));
  const batch = ids.slice(0, limit);
  let updated = 0;
  let failed = 0;
  for (const id of batch) {
    try {
      const charges = razorpayChargeFields((await rzp().payments.fetch(id)) as any);
      if (charges.razorpayFee === undefined) {
        failed += 1;
        continue;
      }
      await Promise.all([
        Payment.updateMany({ razorpayPaymentId: id, razorpayFee: { $exists: false } }, { $set: charges }),
        SalesPaymentLink.updateMany({ razorpayPaymentId: id, razorpayFee: { $exists: false } }, { $set: charges }),
      ]);
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error("Razorpay fee fetch failed", { id, error: (error as any)?.error || error });
    }
  }
  return { configured: true, checked: batch.length, updated, failed, remaining: ids.length - batch.length };
}
