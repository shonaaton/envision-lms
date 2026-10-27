// Pure GST arithmetic, shared by the server (lib/fees.ts) and the invoice
// creation form's live preview, so what the admin sees is what gets saved.
// All amounts are in paise.

export type InvoiceTaxMode = "included" | "excluded" | "non_gst";

function resolveTaxMode(settings: any, options?: { gstMode?: string; gstPercentage?: number }) {
  const invoiceMode = options?.gstMode || (settings?.invoiceMode === "gst" ? "excluded" : "non_gst");
  const gstPercentage = Number(options?.gstPercentage ?? settings?.gstPercentage ?? 0);
  return {
    invoiceMode,
    gstPercentage: invoiceMode === "non_gst" ? 0 : gstPercentage,
  };
}

/**
 * "included": the amount is what the student pays; GST is carved out of it.
 * "excluded": the amount is the base; GST is added on top.
 * "non_gst": no tax lines at all.
 */
export function invoiceBreakup(amount: number, lateFee: number, settings: any, options?: { gstMode?: string; gstPercentage?: number }) {
  const grossAmount = amount + lateFee;
  const { invoiceMode, gstPercentage } = resolveTaxMode(settings, options);
  const divisor = 100 + gstPercentage;
  const taxableAmount = invoiceMode === "included" && gstPercentage > 0
    ? Math.round((grossAmount * 100) / divisor)
    : grossAmount;
  const gstAmount = invoiceMode === "non_gst" || gstPercentage <= 0
    ? 0
    : invoiceMode === "included"
      ? Math.max(0, grossAmount - taxableAmount)
      : Math.round((grossAmount * gstPercentage) / 100);
  const totalAmount = invoiceMode === "excluded" ? taxableAmount + gstAmount : grossAmount;
  return {
    invoiceMode,
    taxableAmount,
    gstPercentage,
    gstAmount,
    cgstAmount: Math.round(gstAmount / 2),
    sgstAmount: gstAmount - Math.round(gstAmount / 2),
    totalAmount,
  };
}
