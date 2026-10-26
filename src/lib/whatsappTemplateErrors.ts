import type { WhatsAppSendResult } from "@/lib/whatsappAutomation";

/** Meta codes meaning "this template is not usable yet" (missing, unapproved, paused). */
const TEMPLATE_UNAVAILABLE_META_CODES = new Set([132001, 132015, 132016]);

/** True when a send failed only because Meta has not approved (or has paused) the template. */
export function templateUnavailable(result: WhatsAppSendResult) {
  if (result.delivered || result.skipped) return false;
  const code = Number((result.payload as any)?.error?.code || 0);
  if (TEMPLATE_UNAVAILABLE_META_CODES.has(code)) return true;
  const text = `${result.errorMessage || ""} ${result.error || ""}`;
  return /does not exist|not been approved|template.{0,40}(missing|not found)|paused|disabled/i.test(text);
}
