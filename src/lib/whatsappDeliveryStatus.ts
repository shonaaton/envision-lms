// Provider receipts can be duplicated and arrive out of order. Never move a
// delivered/read message back to sent, or replace the original media payload.
export function whatsAppDeliveryUpdate(receipt: any) {
  const status = String(receipt.status || "");
  const blocked: Record<string, string[]> = {
    sent: ["delivered", "read", "failed"],
    delivered: ["read"],
    read: [],
    failed: ["delivered", "read"],
  };
  if (!receipt.id || !(status in blocked)) return null;
  return {
    filter: { metaMessageId: String(receipt.id), status: { $nin: blocked[status] } },
    update: { $set: {
      status,
      uncertain: false,
      error: status === "failed" ? String(receipt.errors?.[0]?.message || receipt.errors?.[0]?.error_data?.details || "WhatsApp delivery failed.") : "",
      "rawPayload.deliveryStatus": receipt,
    } },
  };
}
