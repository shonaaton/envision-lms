import { pushLeadStage } from "@/lib/crm/client";
import { crmPhoneNumber, phoneKey } from "@/lib/crm/identity";
import { contactInterestLabel } from "@/lib/contactEnquiries";
import { demoAgeGroupLabel, demoChildLevelLabel, demoRequestEventId } from "@/lib/demoRequest";
import { browserFromRequest, sendDemoLeadMetaEvent } from "@/lib/demoLeadMetaEvents";
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
  const lead: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, announcedAt: null },
    { $set: { announcedAt: new Date() } },
    { new: true },
  ).lean();
  if (!lead) return;

  await raiseDemoRequestTask(lead);

  // To the campaign pixel, with the id the browser pixel used for its own Lead, so Meta counts one.
  await sendDemoLeadMetaEvent({
    lead,
    eventName: "Lead",
    eventId: demoRequestEventId(String(lead._id)),
    browser: browserFromRequest(request, getClientIp(request.headers)),
  });

  // A number the CRM already knows may be further along, even a current student's
  // parent asking about a sibling, and this push would move it back to the start.
  // The task above still reaches sales for those.
  const known = await CrmLeadRecord.exists({ phoneKey: phoneKey(lead.phone) }).catch(() => null);
  if (known) return;
  const push = await pushLeadStage({
    name: lead.name,
    phone: crmPhoneNumber(lead),
    stage: "DEMO_REQUESTED",
    note: [
      "Free demo form",
      `Age: ${demoAgeGroupLabel(lead.ageGroup)}`,
      `Level: ${demoChildLevelLabel(lead.childLevel)}`,
      `Preference: ${contactInterestLabel(lead.interest)}`,
      `Convenient time: ${lead.preferredTime}`,
      lead.whatsappVerifiedAt ? "WhatsApp verified" : "WhatsApp not verified",
    ].join(" | "),
  });
  if (!push.ok && !push.skipped) console.error("[demo-request] CRM push failed", push.reason);
}
