import "server-only";
import { dbConnect } from "@/lib/db";
import { normalizeWhatsAppNumber, normalizeWhatsAppRecipient, sendWhatsAppTextMessage } from "@/lib/whatsappAutomation";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { MESSAGE_FIELDS, buildThread, isReaction, previewText } from "@/lib/whatsappMessageView";
import { BranchStudent } from "@/models/Branch";
import { BranchError } from "./errors";
import type { BranchKey } from "./scope";
import { tenDigitPhone } from "./admissionRules";

/**
 * The academy's WhatsApp, narrowed to a branch's families: conversations with
 * the phone numbers on its student records, and replies inside WhatsApp's
 * 24-hour window. The messages themselves live in the shared inbox store.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Where this screen serves media from: its own route, which checks the number is a family here. */
export const BRANCH_MEDIA_BASE = "/api/bowbazar/whatsapp/media";
const PREVIEW_FIELDS = Object.fromEntries(MESSAGE_FIELDS.split(" ").map((field) => [field, 1]));

/** Each family number at the branch, in the spellings the inbox may have stored, with the children on it. */
async function familyNumbers(branch: BranchKey) {
  const students: any[] = await BranchStudent.find({ branch }).select("name phone parentName status").lean();
  const byNumber = new Map<string, { names: string[]; parentName: string; active: boolean }>();
  for (const student of students) {
    const phone = tenDigitPhone(student.phone);
    if (!phone) continue;
    const canonical = normalizeWhatsAppRecipient(phone, "+91") || `91${phone}`;
    const entry = byNumber.get(canonical) || { names: [] as string[], parentName: student.parentName || "", active: false };
    entry.names.push(student.name);
    entry.active = entry.active || student.status === "active";
    byNumber.set(canonical, entry);
  }
  const spellings = new Map<string, string>(); // stored spelling -> canonical
  for (const canonical of byNumber.keys()) {
    const national = canonical.slice(-10);
    for (const spelling of [canonical, `91${national}`, `+91${national}`, national]) spellings.set(spelling, canonical);
  }
  return { byNumber, spellings };
}

async function canonicalFor(branch: BranchKey, phone: string) {
  const { byNumber, spellings } = await familyNumbers(branch);
  const canonical = spellings.get(normalizeWhatsAppNumber(phone)) || spellings.get(phone);
  if (!canonical) throw new BranchError("That number isn't a family of this centre.", 404);
  return { canonical, family: byNumber.get(canonical)!, stored: [...spellings.entries()].filter(([, value]) => value === canonical).map(([key]) => key) };
}

/** Conversations with this branch's families, latest first. */
export async function branchConversations(branch: BranchKey) {
  await dbConnect();
  const { byNumber, spellings } = await familyNumbers(branch);
  if (!spellings.size) return [];
  const groups: any[] = await WhatsAppMessage.aggregate([
    { $match: { phoneNumber: { $in: [...spellings.keys()] } } },
    { $sort: { createdAt: -1 } },
    // Only what the preview needs: rawPayload holds whole webhook bodies.
    { $project: PREVIEW_FIELDS },
    {
      $group: {
        _id: "$phoneNumber",
        latest: { $first: "$$ROOT" },
        lastAt: { $first: "$createdAt" },
        lastInboundAt: { $max: { $cond: [{ $eq: ["$direction", "inbound"] }, { $ifNull: ["$receivedAt", "$createdAt"] }, null] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const merged = new Map<string, any>();
  for (const group of groups) {
    const canonical = spellings.get(group._id)!;
    const current = merged.get(canonical);
    if (!current || new Date(group.lastAt) > new Date(current.lastAt)) merged.set(canonical, { ...group, count: (current?.count || 0) + group.count });
    else current.count += group.count;
  }
  return [...merged.entries()]
    .map(([phone, group]) => {
      const family = byNumber.get(phone)!;
      return {
        phone,
        students: family.names,
        parentName: family.parentName,
        active: family.active,
        lastText: previewText(group.latest || {}) || "",
        lastDirection: String(group.latest?.direction || ""),
        lastAt: group.lastAt,
        windowOpen: Boolean(group.lastInboundAt && Date.now() - new Date(group.lastInboundAt).getTime() < WINDOW_MS),
        messages: group.count as number,
      };
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

export async function branchConversation(branch: BranchKey, phone: string) {
  await dbConnect();
  const { canonical, family, stored } = await canonicalFor(branch, phone);
  const messages: any[] = await WhatsAppMessage.find({ phoneNumber: { $in: stored } }).select(MESSAGE_FIELDS).sort({ createdAt: -1 }).limit(150).lean();
  const lastInbound = messages.find((message) => message.direction === "inbound" && !isReaction(message));
  const lastInboundAt = lastInbound ? new Date(lastInbound.receivedAt || lastInbound.createdAt) : null;
  return {
    phone: canonical,
    students: family.names,
    parentName: family.parentName,
    windowOpen: Boolean(lastInboundAt && Date.now() - lastInboundAt.getTime() < WINDOW_MS),
    // The online inbox's own view of each message: template text, media, reactions, ticks.
    messages: buildThread(messages.reverse(), BRANCH_MEDIA_BASE),
  };
}

/** Whether a stored message's number is one of this branch's families (media downloads). */
export async function isBranchFamilyNumber(branch: BranchKey, storedPhone: string) {
  const { spellings } = await familyNumbers(branch);
  return spellings.has(String(storedPhone || ""));
}

/** The spelling the inbox stored this family's messages under, for the attachment sender's window check. */
export async function storedFamilyNumber(branch: BranchKey, phone: string) {
  await dbConnect();
  const { canonical, stored } = await canonicalFor(branch, phone);
  const lastInbound: any = await WhatsAppMessage.findOne({ phoneNumber: { $in: stored }, direction: "inbound" }).sort({ createdAt: -1 }).select("phoneNumber").lean();
  return String(lastInbound?.phoneNumber || canonical);
}

/** A free-text reply, allowed by WhatsApp only within 24 hours of the family's last message. */
export async function replyToFamily(branch: BranchKey, phone: string, input: any, actor: { id: string; name?: string }) {
  await dbConnect();
  const text = String(input?.text || "").trim();
  if (!text) throw new BranchError("Write the message.");
  if (text.length > 4096) throw new BranchError("Keep the message under 4,096 characters.");
  const { canonical, stored } = await canonicalFor(branch, phone);
  const lastInbound: any = await WhatsAppMessage.findOne({ phoneNumber: { $in: stored }, direction: "inbound" }).sort({ createdAt: -1 }).lean();
  const lastAt = lastInbound ? new Date(lastInbound.receivedAt || lastInbound.createdAt).getTime() : 0;
  if (!lastAt || Date.now() - lastAt >= WINDOW_MS) {
    throw new BranchError("WhatsApp only allows a typed reply within 24 hours of the family's last message. Use \"Open in WhatsApp\" to message them from the centre's phone.", 409);
  }
  const result = await sendWhatsAppTextMessage({
    to: canonical,
    text,
    testMode: false,
    metadata: { kind: "manual_whatsapp_reply", source: `branch_${branch}`, actor: actor.id },
  });
  const uncertain = ["whatsapp_n8n_failed", "whatsapp_failed"].includes(result.error || "");
  await WhatsAppMessage.create({
    phoneNumber: lastInbound?.phoneNumber || canonical,
    contactName: "",
    direction: "outbound",
    messageType: "text",
    text,
    status: result.ok ? "accepted" : uncertain || result.skipped ? "queued" : "failed",
    uncertain,
    metaMessageId: result.metaMessageId || undefined,
    error: result.errorMessage || result.error || "",
    rawPayload: result.payload,
    sentBy: actor.id,
    sentAt: new Date(),
  });
  if (!result.ok) throw new BranchError(uncertain ? "Delivery is unconfirmed. Check the conversation before sending again." : result.errorMessage || "The reply could not be sent.", 502);
  return { ok: true };
}
