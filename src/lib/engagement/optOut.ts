import { normalizeWhatsAppNumber, normalizeWhatsAppRecipient, sendWhatsAppTextMessage, whatsAppPhoneVariants } from "@/lib/whatsappAutomation";
import { User } from "@/models/User";

const STOP_WORDS = new Set(["STOP", "UNSUBSCRIBE", "STOP UPDATES"]);
const START_WORDS = new Set(["START", "SUBSCRIBE", "START UPDATES"]);

export function optOutCommand(text: string): "stop" | "start" | null {
  const word = String(text || "").trim().toUpperCase().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  return null;
}

/**
 * Every account behind this WhatsApp number. Siblings share the parent's phone,
 * so STOP from that phone has to reach all of them. Only accounts whose own
 * dialling code reproduces the exact number count; a loose national-number
 * match is trusted only when it is the one and only account.
 */
async function accountsForNumber(phoneNumber: string) {
  const digits = normalizeWhatsAppNumber(phoneNumber);
  const variants = whatsAppPhoneVariants(digits);
  if (!variants.length) return [];
  const candidates: any[] = await User.find({ phone: { $in: variants }, role: "student" }).select("_id phone countryCode").lean();
  const exact = candidates.filter((user) => normalizeWhatsAppRecipient(user.phone, user.countryCode) === digits);
  return exact.length ? exact : candidates.length === 1 ? candidates : [];
}

/**
 * A "STOP" or "START" reply to the weekly update. Turns the weekly digest and
 * nudge off (or back on) for every student on that number and confirms in
 * free text - allowed because the family has just written to us, which opens
 * WhatsApp's 24-hour window. Class, fee and schedule messages are unaffected.
 */
export async function handleOptOutReply(phoneNumber: string, text: string) {
  const command = optOutCommand(text);
  if (!command) return null;
  const accounts = await accountsForNumber(phoneNumber);
  if (!accounts.length) return { command, updated: 0 };
  const ids = accounts.map((user) => user._id);
  const now = new Date();
  const update = command === "stop"
    ? { $set: { "engagementOptOut.optedOut": true, "engagementOptOut.at": now, "engagementOptOut.via": "whatsapp_stop" } }
    : { $set: { "engagementOptOut.optedOut": false, "engagementOptOut.at": now }, $unset: { "engagementOptOut.via": 1 } };
  const result = await User.updateMany({ _id: { $in: ids } }, update);
  const reply = command === "stop"
    ? "You will no longer receive the weekly progress updates from Envision Chess Academy. Class reminders, schedule changes and fee messages will still come to this number. Reply START at any time to get the weekly updates again."
    : "Weekly progress updates from Envision Chess Academy are switched back on. Reply STOP at any time to turn them off.";
  await sendWhatsAppTextMessage({
    to: accounts[0].phone,
    countryCode: accounts[0].countryCode,
    text: reply,
    metadata: { kind: "engagement_opt_out", event: command, userId: String(ids[0]) },
  }).catch((error) => console.error("opt-out confirmation failed", error));
  return { command, updated: result.modifiedCount };
}
