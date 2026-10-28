function clean(value?: string) { return String(value || "").trim().replace(/^["']|["']$/g, ""); }
export function whatsappMetaConfig() {
  const version = clean(process.env.WHATSAPP_GRAPH_VERSION || "v25.0");
  return {
    accessToken: clean(process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN),
    businessAccountId: clean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID),
    phoneNumberId: clean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    graphVersion: version.startsWith("v") ? version : `v${version}`,
  };
}
export class WhatsAppMetaError extends Error {
  constructor(message: string, public status = 502, public uncertain = false, public code?: number) { super(message); }
}

export async function whatsappGraph(path: string, init: RequestInit = {}, timeout = 20_000) {
  const config = whatsappMetaConfig();
  if (!config.accessToken) throw new WhatsAppMetaError("The Meta access token is not configured.", 503);
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${config.accessToken}`, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers }, signal: AbortSignal.timeout(timeout) });
  } catch { throw new WhatsAppMetaError("Meta did not return a confirmed response. Refresh the status before trying again.", 502, init.method === "POST"); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) throw new WhatsAppMetaError(String(payload?.error?.error_user_msg || payload?.error?.message || "Meta could not complete this request."), response.status >= 500 ? 502 : 400, response.status >= 500 && init.method === "POST", payload?.error?.code);
  if (!payload) throw new WhatsAppMetaError("Meta returned an unreadable response. Check the status before trying again.", 502, init.method === "POST");
  return payload;
}

export async function sendGraphMessage(body: Record<string, unknown>) {
  const { phoneNumberId } = whatsappMetaConfig();
  if (!phoneNumberId) throw new WhatsAppMetaError("The WhatsApp sending number is not configured.", 503);
  const payload = await whatsappGraph(`${phoneNumberId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }) });
  if (!payload.messages?.[0]?.id) throw new WhatsAppMetaError("Meta has not confirmed this message. Check delivery before sending again.", 502, true);
  return { payload, metaMessageId: String(payload.messages[0].id), status: "accepted" };
}
