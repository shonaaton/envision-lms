import { pushLeadStage } from "@/lib/crm/client";
import { crmPhoneNumber, phoneKey } from "@/lib/crm/identity";
import { contactInterestLabel } from "@/lib/contactEnquiries";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { assignDemoLeadOwner } from "@/lib/demoLeadCrm";
import { leadSourceLine } from "@/lib/leadSource";
import { demoAgeGroupLabel, demoChildLevelLabel, demoRequestEventId } from "@/lib/demoRequest";
import { metaRequestContext, sendMetaLead } from "@/lib/metaConversionsApi";
import { getClientIp } from "@/lib/requestSecurity";
import { raiseDemoRequestTask } from "@/lib/tasks/taskTriggers";
import { ContactMessage } from "@/models/ContactMessage";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

/**
 * Tells sales about a demo request, once.
 *
 * Runs when the number is verified, or straight away when the code could not be
 * sent: paid traffic lands on this form, so a WhatsApp outage must not lose the
 * family. The claim on `announcedAt` is what keeps it to one announcement.
 */
export async function announceDemoRequest(leadId: string, request: Request) {
  // Read now: the route has already answered the family by the time this runs.
  const metaContext = metaRequestContext(request, getClientIp(request.headers));
  const siteUrl = resolvePublicAppUrl(request);
  const claimed: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, announcedAt: null },
    { $set: { announcedAt: new Date() }, $unset: { awaitingCode: 1 } },
    { new: true },
  ).lean();
  if (!claimed) return;

  // A request only gets an owner once it is submitted, so an abandoned code
  // step never uses up a salesperson's turn. A fault here leaves the lead
  // unowned, where the CRM's next admin visit hands it out.
  const owned: any = await assignDemoLeadOwner(leadId).catch((error) => {
    console.error("[demo-request] lead not assigned", error);
    return null;
  });
  const lead = owned || claimed;

  await raiseDemoRequestTask(lead);

  // The server copy of the form's Lead event (the thank-you page's pixel sends
  // the same id, and Meta keeps one). Runs once, inside the announcedAt claim.
  await sendDemoLeadToMeta(lead, metaContext, siteUrl);

  // A number the CRM already knows may be further along, even a current student's
  // parent asking about a sibling, and this push would move it back to the start.
  // The task above still reaches sales for those.
  const known = await CrmLeadRecord.exists({ phoneKey: phoneKey(lead.phone) }).catch(() => null);
  if (known) return;
  const push = await pushLeadStage({
    name: lead.name,
    email: lead.email || undefined,
    phone: crmPhoneNumber(lead),
    stage: "DEMO_REQUESTED",
    note: [
      "Free demo form",
      `Source: ${leadSourceLine(lead.leadSource)}`,
      `Age: ${demoAgeGroupLabel(lead.ageGroup)}`,
      `Level: ${demoChildLevelLabel(lead.childLevel)}`,
      `Preference: ${contactInterestLabel(lead.interest)}`,
      `Convenient time: ${lead.preferredTime}`,
      lead.whatsappVerifiedAt ? "WhatsApp verified" : "WhatsApp not verified",
    ].join(" | "),
  });
  if (!push.ok && !push.skipped) console.error("[demo-request] CRM push failed", push.reason);
}

async function sendDemoLeadToMeta(lead: any, context: ReturnType<typeof metaRequestContext>, siteUrl: string) {
  const id = String(lead._id);
  const result = await sendMetaLead({
    eventId: demoRequestEventId(id),
    eventTime: Math.floor(Date.now() / 1000),
    eventSourceUrl: `${siteUrl || "https://envisionchessacademy.com"}/book-free-demo-class/thank-you`,
    email: lead.email,
    phone: crmPhoneNumber(lead),
    name: lead.name,
    fbclid: lead.leadSource?.fbclid,
    clickedAt: lead.createdAt ? new Date(lead.createdAt).getTime() : undefined,
    context,
  }).catch((error) => ({ ok: false as const, reason: String(error?.message || error) }));
  if ("skipped" in result && result.skipped) return;
  if (!result.ok) console.error("[demo-request] Meta Conversions API send failed", result.reason);
  await ContactMessage.updateOne(
    { _id: id },
    result.ok ? { $set: { metaLeadSentAt: new Date() }, $unset: { metaLeadError: 1 } } : { $set: { metaLeadError: result.reason } },
  ).catch(() => undefined);
}
