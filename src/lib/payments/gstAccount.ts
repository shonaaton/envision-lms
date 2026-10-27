/**
 * Razorpay settles into the academy's GST account. Non-GST fees are paid into a
 * different account (user, 2026-10-27), so only a GST invoice or plan may be
 * collected through Razorpay: payment links, reminder links and portal checkout.
 * Accepts an invoice (`invoiceMode`) or a fee plan (`gstMode`).
 */
export function collectsThroughRazorpay(record: { invoiceMode?: string | null; gstMode?: string | null; gstPercentage?: number | null } | null | undefined) {
  const mode = String(record?.invoiceMode ?? record?.gstMode ?? "non_gst");
  return (mode === "included" || mode === "excluded") && Number(record?.gstPercentage || 0) > 0;
}

export const NON_GST_RAZORPAY_MESSAGE = "This is a non-GST invoice. It is paid into the other account, not through Razorpay.";
