import "server-only";

import { formatAcademyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { contactDisplayPhone, whatsappDigits } from "@/lib/contactEnquiries";
import { dbConnect } from "@/lib/db";
import { DEMO_REQUEST_KIND, SUBMITTED_DEMO_REQUEST, demoAgeGroupLabel, demoChildLevelLabel } from "@/lib/demoRequest";
import { demoSlotLabel } from "@/lib/demoRequestSlots";
import {
  BROCHURE_BASE_PATH,
  BROCHURE_DELAY_MS,
  CALL_LINK_PATH,
  CALL_REMINDER_LEAD_MS,
  DEMO_LEAD_BROCHURE_TEMPLATE,
  DEMO_LEAD_WELCOME_TEMPLATE,
  NOT_SHARED,
  SLOT_NOT_CHOSEN,
  WELCOME_WAIT_FOR_SLOT_MS,
  callLinkToken,
  callbackButtonPayload,
  demoLeadBrochures,
  leadIdFromCallbackPayload,
  nextCallTime,
} from "@/lib/demoLeadWhatsAppRules";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { normalizeWhatsAppNumber, sanitizeWhatsAppParameter } from "@/lib/whatsappAutomation";
import { isWhatsAppAutomationTemplateEnabled } from "@/lib/whatsappAutomationSettings";
import { sendGraphMessage } from "@/lib/whatsappMeta";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { ContactMessage } from "@/models/ContactMessage";
import { DemoLeadReminder } from "@/models/DemoLeadReminder";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { WhatsAppMessage } from "@/models/WhatsApp";

/**
 * WhatsApp for new Demo Leads CRM leads (2026-11-20, user request):
 *
 * - `demo_lead_welcome` recaps the request (age, level, time to call, demo
 *   time) and names the salesperson, with "Call sales person" (a link that
 *   dials them) and "Confirm call-back" (tells them to call at that time).
 * - ten seconds later, `demo_lead_brochure` twice: the India fee PDF for the
 *   child's level, then the Global profile.
 *
 * A form lead is queued when it is announced and waits up to
 * WELCOME_WAIT_FOR_SLOT_MS for the family to pick a demo slot on the thank-you
 * page (picking one sends it at once), so the recap can carry the slot. A lead
 * added by hand goes straight away. The minute sweep sends whatever is due and
 * picks up brochures a restart interrupted. Every send is claimed first, so a
 * lead gets each message once.
 *
 * Both templates start switched off (OFF_UNTIL_ENABLED_TEMPLATES): nothing is
 * sent until Meta approves them and an admin turns them on in the WhatsApp
 * workspace. Sent straight to Meta, because the n8n relay and
 * sendWhatsAppTemplateMessage only carry body text, not buttons or a PDF; each
 * send is still written to the WhatsApp inbox so sales sees the conversation.
 */

const CANONICAL_SITE = "https://envisionchessacademy.com";

/** The public site for links Meta and the parent open. Never localhost: Meta has to fetch the PDFs. */
function siteUrl() {
  const url = resolvePublicAppUrl(undefined, { allowRequestHeaders: false });
  return url && !url.includes("localhost") ? url : CANONICAL_SITE;
}

function firstName(name?: string | null) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

/** Queue the welcome for a lead that has just reached the CRM. Safe to call twice. */
export async function queueDemoLeadWelcome(leadId: unknown, options: { immediate?: boolean } = {}) {
  try {
    await dbConnect();
    const dueAt = new Date(Date.now() + (options.immediate ? 0 : WELCOME_WAIT_FOR_SLOT_MS));
    await ContactMessage.updateOne({ _id: leadId, kind: DEMO_REQUEST_KIND, waWelcomeDueAt: null, waWelcomeClaimedAt: null }, { $set: { waWelcomeDueAt: dueAt } });
    if (options.immediate) await sendDemoLeadWelcome(leadId);
  } catch (error) {
    console.error("[demo-lead-whatsapp] could not queue the welcome", String(leadId), error);
  }
}

/** The family picked a demo slot on the thank-you page: the welcome need not wait any longer. */
export async function demoSlotChosen(leadId: unknown) {
  try {
    await sendDemoLeadWelcome(leadId);
  } catch (error) {
    console.error("[demo-lead-whatsapp] welcome after slot failed", String(leadId), error);
  }
}

async function bothTemplatesOn() {
  const [welcome, brochure] = await Promise.all([
    isWhatsAppAutomationTemplateEnabled(DEMO_LEAD_WELCOME_TEMPLATE),
    isWhatsAppAutomationTemplateEnabled(DEMO_LEAD_BROCHURE_TEMPLATE),
  ]);
  return { welcome, brochure };
}

async function logOutbound(lead: any, recipient: string, templateName: string, values: string[], result: { metaMessageId?: string; error?: string }, extra: Record<string, unknown> = {}) {
  try {
    await WhatsAppMessage.create({
      phoneNumber: normalizeWhatsAppNumber(recipient),
      contactName: String(lead.name || ""),
      direction: "outbound",
      messageType: "template",
      text: renderWhatsAppTemplatePreview(templateName, values),
      templateName,
      templateLanguage: "en",
      status: result.metaMessageId ? "accepted" : "failed",
      metaMessageId: result.metaMessageId || undefined,
      error: result.error || "",
      rawPayload: { sender: "meta", metadata: { automation: "demo_lead_whatsapp", leadId: String(lead._id), ...extra }, templateVariables: values },
      sentAt: new Date(),
    });
  } catch (error) {
    console.error("[demo-lead-whatsapp] inbox log failed", String(lead._id), error);
  }
}

/** Builds the welcome's six values. Exported for the test harness and the preview. */
export function demoLeadWelcomeValues(lead: any) {
  return [
    lead.name,
    lead.ageGroup ? demoAgeGroupLabel(lead.ageGroup) : NOT_SHARED,
    lead.childLevel ? demoChildLevelLabel(lead.childLevel) : NOT_SHARED,
    lead.preferredTime || NOT_SHARED,
    demoSlotLabel(lead.demoSlotDate, lead.demoSlotTime) || SLOT_NOT_CHOSEN,
    firstName(lead.salesOwnerName) || "Our sales team",
  ].map((value) => sanitizeWhatsAppParameter(value) || NOT_SHARED);
}

/**
 * Sends the welcome now if it is queued and not yet claimed. Returns true when
 * Meta accepted it. The brochures are scheduled BROCHURE_DELAY_MS later.
 */
export async function sendDemoLeadWelcome(leadId: unknown) {
  await dbConnect();
  const enabled = await bothTemplatesOn();
  if (!enabled.welcome) return false;

  const lead: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, kind: DEMO_REQUEST_KIND, ...SUBMITTED_DEMO_REQUEST, waWelcomeDueAt: { $ne: null }, waWelcomeClaimedAt: null },
    { $set: { waWelcomeClaimedAt: new Date() } },
    { new: true },
  ).lean();
  if (!lead) return false;
  const result = await deliverWelcome(lead, "System");
  if (result.ok && enabled.brochure) {
    const id = String(lead._id);
    await ContactMessage.updateOne({ _id: id }, { $set: { waBrochuresDueAt: new Date(Date.now() + BROCHURE_DELAY_MS) } });
    // The minute sweep is the safety net if the server restarts inside these ten seconds.
    setTimeout(() => void sendDemoLeadBrochures(id).catch((error) => console.error("[demo-lead-whatsapp] brochures failed", id, error)), BROCHURE_DELAY_MS).unref?.();
  }
  return result.ok;
}

type SendResult = { ok: true } | { ok: false; error: string };

async function deliverWelcome(lead: any, byName: string, by?: string): Promise<SendResult> {
  const recipient = whatsappDigits(lead.countryCode, lead.phone);
  const values = demoLeadWelcomeValues(lead);
  const id = String(lead._id);
  try {
    const { metaMessageId } = await sendGraphMessage({
      to: recipient,
      type: "template",
      template: {
        name: DEMO_LEAD_WELCOME_TEMPLATE,
        language: { code: "en" },
        components: [
          { type: "body", parameters: values.map((text) => ({ type: "text", text })) },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: callLinkToken(id) }] },
          { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: callbackButtonPayload(id) }] },
        ],
      },
    });
    await ContactMessage.updateOne(
      { _id: id },
      {
        $set: { waWelcomeSentAt: new Date() },
        $unset: { waWelcomeError: 1 },
        $push: { leadLog: { kind: "whatsapp", text: "Welcome WhatsApp sent (recap, Call sales person, Confirm call-back).", by, byName, at: new Date() } },
      },
    );
    await logOutbound(lead, recipient, DEMO_LEAD_WELCOME_TEMPLATE, values, { metaMessageId });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "WhatsApp send failed");
    console.error("[demo-lead-whatsapp] welcome not sent", id, message);
    // Not retried automatically: a refused number stays refused. The CRM button can try again.
    await ContactMessage.updateOne({ _id: id }, { $set: { waWelcomeError: message.slice(0, 300) } });
    await logOutbound(lead, recipient, DEMO_LEAD_WELCOME_TEMPLATE, values, { error: message });
    return { ok: false, error: message };
  }
}

/** The level's India fee PDF, then the Global profile, ten seconds after the welcome. Claimed once per lead. */
export async function sendDemoLeadBrochures(leadId: unknown) {
  await dbConnect();
  if (!(await isWhatsAppAutomationTemplateEnabled(DEMO_LEAD_BROCHURE_TEMPLATE))) return false;
  const now = new Date();
  const lead: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, waWelcomeSentAt: { $ne: null }, waBrochuresDueAt: { $lte: now }, waBrochuresClaimedAt: null },
    { $set: { waBrochuresClaimedAt: now } },
    { new: true },
  ).lean();
  if (!lead) return false;
  return (await deliverBrochures(lead, "System")).ok;
}

async function deliverBrochures(lead: any, byName: string, by?: string): Promise<SendResult> {
  const recipient = whatsappDigits(lead.countryCode, lead.phone);
  const base = siteUrl();
  const errors: string[] = [];
  const sent: string[] = [];
  for (const brochure of demoLeadBrochures(lead.childLevel)) {
    const values = [lead.name, brochure.description].map((value) => sanitizeWhatsAppParameter(value) || NOT_SHARED);
    try {
      const { metaMessageId } = await sendGraphMessage({
        to: recipient,
        type: "template",
        template: {
          name: DEMO_LEAD_BROCHURE_TEMPLATE,
          language: { code: "en" },
          components: [
            { type: "header", parameters: [{ type: "document", document: { link: `${base}${BROCHURE_BASE_PATH}/${brochure.file}`, filename: brochure.filename } }] },
            { type: "body", parameters: values.map((text) => ({ type: "text", text })) },
          ],
        },
      });
      sent.push(brochure.filename.replace(/^Envision Chess Academy - /, "").replace(/\.pdf$/, ""));
      await logOutbound(lead, recipient, DEMO_LEAD_BROCHURE_TEMPLATE, values, { metaMessageId }, { brochure: brochure.file });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "WhatsApp send failed");
      errors.push(`${brochure.file}: ${message}`);
      await logOutbound(lead, recipient, DEMO_LEAD_BROCHURE_TEMPLATE, values, { error: message }, { brochure: brochure.file });
    }
  }
  await ContactMessage.updateOne(
    { _id: lead._id },
    {
      ...(errors.length ? { $set: { waBrochuresError: errors.join(" | ").slice(0, 500) } } : { $set: { waBrochuresSentAt: new Date() }, $unset: { waBrochuresError: 1 } }),
      ...(sent.length ? { $push: { leadLog: { kind: "whatsapp", text: `Fee PDFs sent on WhatsApp: ${sent.join(", ")}.`, by, byName, at: new Date() } } } : {}),
    },
  );
  return errors.length ? { ok: false, error: errors.join(" | ") } : { ok: true };
}

/**
 * The CRM's "Send welcome" / "Send fee PDFs" buttons (2026-11-20, user request).
 * Send now, again if need be, whatever the automatic switch says: the person
 * pressing the button has decided. Sending the welcome by hand also stops the
 * automatic one, so the family does not get it twice.
 */
export async function sendDemoLeadWhatsAppNow(lead: any, which: "welcome" | "brochures", viewer: { id: string; name: string }): Promise<SendResult> {
  if (!whatsappDigits(lead.countryCode, lead.phone)) return { ok: false, error: "This lead has no WhatsApp number." };
  if (which === "welcome") {
    await ContactMessage.updateOne({ _id: lead._id, waWelcomeClaimedAt: null }, { $set: { waWelcomeClaimedAt: new Date() } });
    return deliverWelcome(lead, viewer.name, viewer.id);
  }
  await ContactMessage.updateOne({ _id: lead._id, waBrochuresClaimedAt: null }, { $set: { waBrochuresClaimedAt: new Date() } });
  return deliverBrochures(lead, viewer.name, viewer.id);
}

/** Every minute: welcomes whose wait for a slot is over, and brochures a restart left behind. */
export async function processDueDemoLeadWhatsApp(now = new Date()) {
  await dbConnect();
  const enabled = await bothTemplatesOn();
  let welcomes = 0;
  let brochures = 0;
  if (enabled.welcome) {
    const due: any[] = await ContactMessage.find({ kind: DEMO_REQUEST_KIND, waWelcomeDueAt: { $lte: now }, waWelcomeClaimedAt: null, ...SUBMITTED_DEMO_REQUEST })
      .sort({ waWelcomeDueAt: 1 })
      .limit(20)
      .select("_id")
      .lean();
    for (const lead of due) if (await sendDemoLeadWelcome(lead._id).catch(() => false)) welcomes += 1;
  }
  if (enabled.brochure) {
    // Ten seconds of grace on top, so the in-process timer gets the first go.
    const due: any[] = await ContactMessage.find({ waBrochuresDueAt: { $lte: new Date(now.getTime() - BROCHURE_DELAY_MS) }, waBrochuresClaimedAt: null })
      .limit(20)
      .select("_id")
      .lean();
    for (const lead of due) if (await sendDemoLeadBrochures(lead._id).catch(() => false)) brochures += 1;
  }
  return { welcomes, brochures };
}

// ---------------------------------------------------------------------------
// "Confirm call-back"
// ---------------------------------------------------------------------------

/**
 * A quick-reply tap from the webhook. Returns true when it was our button.
 *
 * The first tap tells the salesperson at once (bell + email: "X confirmed,
 * please call at <time>") and, when the time they typed can be read, sets a
 * call-back reminder five minutes before it, which the reminder sweep turns
 * into a task, bell notice and email. The parent gets a short thank-you, which
 * the tap itself allows (it opens WhatsApp's 24-hour reply window).
 */
export async function handleDemoLeadButtonReply(message: any) {
  const payload = message?.type === "button" ? message.button?.payload : message?.type === "interactive" ? message.interactive?.button_reply?.id : "";
  const leadId = leadIdFromCallbackPayload(payload);
  if (!leadId) return false;

  await dbConnect();
  const now = new Date();
  const lead: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, kind: DEMO_REQUEST_KIND, callbackConfirmedAt: null },
    {
      $set: { callbackConfirmedAt: now },
      $push: { leadLog: { kind: "whatsapp", text: "Parent tapped Confirm call-back on WhatsApp.", byName: "WhatsApp", at: now } },
    },
    { new: true },
  ).lean();
  // A second tap, or a lead deleted since: nothing more to do, but it was ours.
  if (!lead) return true;

  const name = String(lead.name || "The parent");
  const callTime = String(lead.preferredTime || "").trim();
  const callAt = nextCallTime(callTime, now);
  const owner: any = lead.salesOwner ? await User.findById(lead.salesOwner).select("_id name email isActive").lean() : null;

  if (owner && owner.isActive !== false) {
    if (callAt) {
      const dueAt = new Date(Math.max(callAt.getTime() - CALL_REMINDER_LEAD_MS, now.getTime() + 60_000));
      await DemoLeadReminder.create({
        lead: lead._id,
        leadName: name,
        assignedTo: owner._id,
        assignedToName: owner.name,
        createdByName: "WhatsApp",
        dueAt,
        note: `${name} confirmed a call-back on WhatsApp. Call at ${formatAcademyDateTime(callAt, { timeZoneName: "short" })}.`,
      }).catch((error) => console.error("[demo-lead-whatsapp] reminder not set", leadId, error));
    }
    await notifyOwnerOfConfirmation(owner, lead, callTime, callAt);
  } else {
    console.error("[demo-lead-whatsapp] call-back confirmed on a lead with no active owner", leadId);
  }

  const who = firstName(lead.salesOwnerName) || "our team";
  const when = callTime ? ` at ${callTime}` : "";
  await sendGraphMessage({
    to: whatsappDigits(lead.countryCode, lead.phone),
    type: "text",
    text: { preview_url: false, body: `Thank you, ${firstName(lead.name) || "there"}! Your call-back is confirmed. ${who === "our team" ? "Our team" : who} will call you${when}. ♟️` },
  })
    .then(({ metaMessageId }) =>
      WhatsAppMessage.create({
        phoneNumber: normalizeWhatsAppNumber(whatsappDigits(lead.countryCode, lead.phone)),
        contactName: name,
        direction: "outbound",
        messageType: "text",
        text: `Thank you! Your call-back is confirmed. ${who} will call you${when}.`,
        status: "accepted",
        metaMessageId,
        rawPayload: { sender: "meta", metadata: { automation: "demo_lead_whatsapp", leadId } },
        sentAt: new Date(),
      }),
    )
    .catch((error) => console.error("[demo-lead-whatsapp] thank-you not sent", leadId, error));
  return true;
}

async function notifyOwnerOfConfirmation(owner: any, lead: any, callTime: string, callAt: Date | null) {
  const name = String(lead.name || "The parent");
  const leadId = String(lead._id);
  const href = `/sales/leads?lead=${leadId}`;
  const atText = callAt ? formatAcademyDateTime(callAt, { timeZoneName: "short" }) : callTime || "the time they gave";
  const title = `${name} confirmed the call-back: call at ${callAt ? atText : callTime || "their time"}`;
  const lines = [
    `${name} has confirmed the call-back on WhatsApp. Please call them at ${atText}.`,
    "",
    `Parent: ${name}`,
    `Number: ${contactDisplayPhone(lead.countryCode, lead.phone)}`,
    `Time they gave: ${callTime || "Not given"}`,
    `Demo slot asked for: ${demoSlotLabel(lead.demoSlotDate, lead.demoSlotTime) || "Not chosen yet"}`,
    callAt ? "A reminder is set for 5 minutes before the call." : "Their time could not be read as a clock time, so no reminder was set. Set one on the lead if you need it.",
  ];
  const dedupKey = `demo_lead_callback_confirmed:${leadId}`;
  const inserted = await Notification.updateOne(
    { user: owner._id, "metadata.dedupKey": dedupKey },
    { $setOnInsert: { user: owner._id, type: "demo_lead_callback_confirmed", title: title.slice(0, 200), message: lines.join("\n").slice(0, 1000), metadata: { href, dedupKey, leadId } } },
    { upsert: true },
  ).catch(() => null);
  if (!inserted?.upsertedCount || !owner.email) return;
  await sendAutomationEmail({
    to: owner.email,
    subject: title.slice(0, 200),
    message: [`Hello ${owner.name || "there"},`, "", ...lines].join("\n"),
    actionLabel: "Open the lead",
    metadata: { kind: "demo_lead_callback_confirmed", href, dedupKey, leadId },
  }).catch((error) => console.error("[demo-lead-whatsapp] owner email failed", leadId, error));
}

/** The "Call sales person" page: who to dial for this lead. Records the first open on the lead. */
export async function callTargetForLead(leadId: string) {
  await dbConnect();
  const lead: any = await ContactMessage.findOne({ _id: leadId, kind: DEMO_REQUEST_KIND }).select("salesOwner salesOwnerName callLinkOpenedAt").lean();
  if (!lead) return null;
  const owner: any = lead.salesOwner ? await User.findById(lead.salesOwner).select("name phone countryCode isActive").lean() : null;
  const ownerDigits = owner && owner.isActive !== false ? whatsappDigits(owner.countryCode || "+91", owner.phone) : "";
  const fallback = String(process.env.DEMO_LEAD_CALL_FALLBACK_PHONE || "+918618037398").replace(/[^\d]/g, "");
  if (!lead.callLinkOpenedAt) {
    const now = new Date();
    await ContactMessage.updateOne(
      { _id: leadId, callLinkOpenedAt: null },
      { $set: { callLinkOpenedAt: now }, $push: { leadLog: { kind: "whatsapp", text: "Parent opened Call sales person from WhatsApp.", byName: "WhatsApp", at: now } } },
    ).catch(() => undefined);
  }
  return {
    name: ownerDigits ? firstName(owner.name || lead.salesOwnerName) || "our sales team" : "our sales team",
    digits: ownerDigits || fallback,
  };
}

export const DEMO_LEAD_CALL_LINK_BASE = () => `${siteUrl()}${CALL_LINK_PATH}`;
