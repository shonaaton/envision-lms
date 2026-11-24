import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";
import { User } from "@/models/User";
import { BranchLead, BranchSlot, BranchStudent, BranchWaitlist } from "@/models/Branch";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { BranchError } from "./errors";
import { getBranchSettings } from "./settings";
import { notifyBranchRunners } from "./alerts";
import { SLOT_FEES, WEEK_ORDER, quotedAdmissionFee, slotLabel } from "./rules";
import { tenDigitPhone, whatsAppChatLink } from "./admissionRules";
import { BOWBAZAR_REGISTRATION } from "./registration";
import { getCentrePage } from "@/lib/centrePages";

/**
 * Bowbazar enquiries from the public contact form, and families joining a full
 * slot's waitlist from the centre page. Both are told the open slots and fees
 * at once; the centre's admin and managers get an in-app notice and an email.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const realEmail = (value: unknown) => {
  const email = text(value, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".invalid") ? email : "";
};

export const CENTRE_PAGE_URL: Record<BranchKey, string> = {
  bowbazar: `${MARKETING_BASE_URL}/chess-academy-in-kolkata/bowbazar`,
} as Record<BranchKey, string>;

/** Active centre slots (never online classes), in week order, with free seats. */
export async function publicSlots(branch: BranchKey) {
  await dbConnect();
  const [slots, students]: [any[], any[]] = await Promise.all([
    BranchSlot.find({ branch, mode: "offline", isActive: true }).select("dayOfWeek startTime endTime capacity").lean() as any,
    BranchStudent.find({ branch, status: "active" }).select("slots").lean() as any,
  ]);
  const seated = new Map<string, number>();
  for (const student of students) for (const slot of student.slots || []) seated.set(id(slot), (seated.get(id(slot)) || 0) + 1);
  return slots
    .sort((a, b) => WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime))
    .map((slot) => ({
      id: id(slot),
      dayOfWeek: slot.dayOfWeek as number,
      startTime: slot.startTime as string,
      endTime: slot.endTime as string,
      label: slotLabel(slot),
      free: Math.max(0, (slot.capacity || 0) - (seated.get(id(slot)) || 0)),
    }));
}

/** The fee lines every family message uses. */
export async function feeLines(branch: BranchKey) {
  const settings = await getBranchSettings(branch);
  const monthly = Object.entries(SLOT_FEES)
    .map(([count, fee]) => `${count} ${Number(count) === 1 ? "class" : "classes"} a week: ${rupees(fee)} a month`);
  return { monthly, admissionFee: quotedAdmissionFee(settings.admissionFee) };
}

/** The slots-and-fees text sent to an enquiring family (email body; WhatsApp gets short parts of it). */
export async function slotsAndFeesMessage(branch: BranchKey, greetingName: string) {
  const [slots, fees] = await Promise.all([publicSlots(branch), feeLines(branch)]);
  const label = BRANCH_LABELS[branch];
  const open = slots.filter((slot) => slot.free > 0);
  const full = slots.filter((slot) => slot.free === 0);
  const pageUrl = CENTRE_PAGE_URL[branch];
  const lines = [
    `Hello ${greetingName || "there"},`,
    "",
    `Thank you for asking about chess classes at Envision Chess Academy's ${label} centre (${BOWBAZAR_REGISTRATION.address}).`,
    "",
    "Batches with seats free right now:",
    ...(open.length ? open.map((slot) => `- ${slot.label} (${slot.free} ${slot.free === 1 ? "seat" : "seats"} left)`) : ["- Every batch is full at the moment. You can join the waitlist on our page."]),
    ...(full.length ? ["", `Full now (you can join the waitlist): ${full.map((slot) => slot.label).join(", ")}`] : []),
    "",
    "Fees:",
    ...fees.monthly.map((line) => `- ${line}`),
    `- Admission fee (one time): ${rupees(fees.admissionFee)}`,
    "",
    "Students attend two classes a week. Our team will call you to fix a free demo class and the batch.",
    `Live seats and the waitlist: ${pageUrl}`,
    "",
    "Team Envision Chess Academy",
  ];
  return {
    message: lines.join("\n"),
    pageUrl,
    // Template parameters can't hold line breaks.
    openShort: open.length ? open.map((slot) => `${slot.label} (${slot.free} left)`).join("; ") : "All batches are full now - join the waitlist",
    feesShort: `${fees.monthly.join("; ")}; admission fee ${rupees(fees.admissionFee)} one time`,
  };
}

/** The centre's admin and managers who have a real inbox. */
async function runnerEmails(branch: BranchKey) {
  const staff: any[] = await User.find({ branch, role: "instructor", branchRole: { $in: ["admin", "manager"] }, isActive: { $ne: false } })
    .select("email")
    .setOptions({ allBranches: true })
    .lean();
  const emails = [...new Set(staff.map((user) => realEmail(user.email)).filter(Boolean))];
  return emails.length ? emails : [BOWBAZAR_REGISTRATION.email];
}

/** Emails the centre's admin and managers. Never throws. */
export async function emailBranchRunners(branch: BranchKey, input: { subject: string; message: string; href: string; dedupKey: string }) {
  try {
    const base = MARKETING_BASE_URL;
    const to = await runnerEmails(branch);
    await Promise.all(
      to.map((address) =>
        sendAutomationEmail({
          to: address,
          subject: input.subject,
          message: input.message,
          actionUrl: `${base}${input.href}`,
          actionLabel: "Open the portal",
          metadata: { kind: "branch_staff_alert", dedupKey: `${input.dedupKey}:${address}` },
        }).catch(() => null)
      )
    );
  } catch (error) {
    console.error("[branch] staff email failed", error);
  }
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

function serializeLead(lead: any) {
  return {
    id: id(lead),
    name: lead.name as string,
    email: lead.email || "",
    countryCode: lead.countryCode || "",
    phone: lead.phone || "",
    address: lead.address || "",
    message: lead.message || "",
    status: lead.status as "new" | "contacted" | "converted" | "closed",
    note: lead.note || "",
    autoReply: { email: lead.autoReply?.email || "", whatsapp: lead.autoReply?.whatsapp || "", sentAt: lead.autoReply?.sentAt || null },
    admissionId: lead.admission ? id(lead.admission) : "",
    createdAt: lead.createdAt,
    updatedByName: lead.updatedByName || "",
  };
}
export type BranchLeadView = ReturnType<typeof serializeLead>;

/** Sends the family the open slots and fees by email and WhatsApp; returns what went out. */
async function sendSlotsAndFees(branch: BranchKey, lead: any) {
  const { message, openShort, feesShort, pageUrl } = await slotsAndFeesMessage(branch, lead.name);
  const metadata = { kind: "branch_enquiry_reply", leadId: id(lead), dedupKey: `branch-lead:${id(lead)}:${Date.now()}` };
  const india = !lead.countryCode || lead.countryCode === "+91";
  const phone = india ? tenDigitPhone(lead.phone) : "";
  const [email, whatsapp] = await Promise.all([
    lead.email
      ? sendAutomationEmail({
          to: lead.email,
          subject: `Batch timings and fees: Envision Chess Academy ${BRANCH_LABELS[branch]} centre`,
          message,
          actionUrl: pageUrl,
          actionLabel: "See live seats",
          metadata,
        }).catch(() => ({ delivered: false }))
      : null,
    phone
      ? sendWhatsAppAutomationTemplate({
          to: `91${phone}`,
          templateName: "bowbazar_enquiry_reply",
          bodyParameters: [lead.name || "Parent", openShort, feesShort, pageUrl],
          metadata,
        }).catch(() => ({ delivered: false }))
      : null,
  ]);
  const autoReply = {
    email: email ? (email.delivered ? "sent" : "failed") : "none",
    whatsapp: whatsapp ? (whatsapp.delivered ? "sent" : "failed") : "none",
    sentAt: new Date(),
  };
  await BranchLead.updateOne({ _id: lead._id }, { $set: { autoReply } });
  return { autoReply, message, whatsappLink: phone ? whatsAppChatLink(phone, message) : "" };
}

/**
 * The contact form picked this centre: save the lead, send the family the
 * slots and fees, and tell the centre. Never throws - the form has already
 * been saved, and the family must still see "sent".
 */
export async function leadFromContactForm(branch: BranchKey, contact: any, options: { via?: string } = {}) {
  try {
    await dbConnect();
    // One Lead Center row per enquiry: moving it to "Offline lead" again sends nothing twice.
    if (contact._id && (await BranchLead.exists({ branch, contactMessage: contact._id }))) return;
    const india = !contact.countryCode || contact.countryCode === "+91";
    const lead: any = await BranchLead.create({
      branch,
      name: text(contact.name, 120),
      email: realEmail(contact.email),
      countryCode: text(contact.countryCode, 8),
      phone: india ? tenDigitPhone(contact.phone) || text(contact.phone, 40) : text(contact.phone, 40),
      address: text(contact.address, 300),
      message: text(contact.message, 2000),
      contactMessage: contact._id,
    });
    const { autoReply } = await sendSlotsAndFees(branch, lead.toObject());
    const label = BRANCH_LABELS[branch];
    const who = [lead.name, `${lead.countryCode || ""} ${lead.phone}`.trim(), lead.email].filter(Boolean).join(" · ");
    await notifyBranchRunners(branch, {
      type: "branch_new_lead",
      title: `New enquiry: ${lead.name}`,
      message: `${options.via ? `${options.via}. ` : ""}${who}. Slots and fees were sent automatically (email ${autoReply.email}, WhatsApp ${autoReply.whatsapp}).`,
      href: "/bowbazar/leads",
      metadata: { leadId: id(lead) },
    });
    await emailBranchRunners(branch, {
      subject: `New ${label} enquiry: ${lead.name}`,
      message: [
        options.via ? `${options.via}.` : `A family asked about the ${label} centre on the website.`,
        "",
        `Name: ${lead.name}`,
        `Phone: ${`${lead.countryCode || ""} ${lead.phone}`.trim()}`,
        `Email: ${lead.email || "-"}`,
        lead.address ? `Address: ${lead.address}` : "",
        lead.message ? `Message: ${lead.message}` : "",
        "",
        `They were sent the open slots and fees automatically (email: ${autoReply.email}, WhatsApp: ${autoReply.whatsapp}).`,
        "Open the Lead Center to call them and send the admission form.",
      ]
        .filter((line) => line !== "")
        .join("\n"),
      href: "/bowbazar/leads",
      dedupKey: `branch-lead-staff:${id(lead)}`,
    });
  } catch (error) {
    console.error("[branch] enquiry lead failed", error);
  }
}

/**
 * A salesperson selected Bowbazar in the main portal's Offline Leads CRM.
 * It becomes an ordinary Bowbazar lead, so the branch team sees it in the
 * same Lead Center and the family receives the existing live slots/fees reply.
 */
export async function leadFromOfflineCrm(branch: BranchKey, offlineLead: any) {
  await dbConnect();
  const existing: any = await BranchLead.findOne({ branch, offlineLead: offlineLead._id }).lean();
  if (existing) return existing;
  // A contact-form enquiry moved over from Demo Leads is already in the Lead
  // Center and already had the slots and fees: link it, don't send twice.
  if (offlineLead.sourceDemoLead) {
    const fromForm: any = await BranchLead.findOneAndUpdate(
      { branch, contactMessage: offlineLead.sourceDemoLead, offlineLead: null },
      { $set: { offlineLead: offlineLead._id } },
      { new: true },
    ).lean();
    if (fromForm) return fromForm;
  }
  const india = !offlineLead.countryCode || offlineLead.countryCode === "+91";
  const lead: any = await BranchLead.create({
    branch,
    name: text(offlineLead.parentName, 120),
    email: realEmail(offlineLead.email),
    countryCode: text(offlineLead.countryCode, 8),
    phone: india ? tenDigitPhone(offlineLead.phone) || text(offlineLead.phone, 40) : text(offlineLead.phone, 40),
    message: text([offlineLead.studentName ? `Student: ${offlineLead.studentName}` : "", offlineLead.note].filter(Boolean).join("\n"), 2000),
    offlineLead: offlineLead._id,
  });
  const { autoReply } = await sendSlotsAndFees(branch, lead.toObject());
  await notifyBranchRunners(branch, {
    type: "branch_new_lead",
    title: `New offline lead: ${lead.name}`,
    message: `Sent from the main Offline Leads CRM. Slots and fees were sent automatically (email ${autoReply.email}, WhatsApp ${autoReply.whatsapp}).`,
    href: "/bowbazar/leads",
    metadata: { leadId: id(lead), offlineLeadId: id(offlineLead) },
  });
  await emailBranchRunners(branch, {
    subject: `New Bowbazar offline lead: ${lead.name}`,
    message: [
      "Sales routed a new family to the Bowbazar centre.",
      `Parent: ${lead.name}`,
      offlineLead.studentName ? `Student: ${offlineLead.studentName}` : "",
      `Phone: ${`${lead.countryCode || ""} ${lead.phone}`.trim()}`,
      `Email: ${lead.email || "-"}`,
      offlineLead.note ? `Note: ${offlineLead.note}` : "",
      `The family was sent live slots and fees automatically (email: ${autoReply.email}, WhatsApp: ${autoReply.whatsapp}).`,
    ].filter(Boolean).join("\n"),
    href: "/bowbazar/leads",
    dedupKey: `offline-lead-bowbazar:${id(offlineLead)}`,
  });
  return lead.toObject();
}

export async function listLeads(branch: BranchKey) {
  await dbConnect();
  const leads: any[] = await BranchLead.find({ branch }).sort({ createdAt: -1 }).limit(500).lean();
  return leads.map(serializeLead);
}

const LEAD_STATUSES = ["new", "contacted", "converted", "closed"];

/** `{ status?, note? }` or `{ action: "resend" }` (sends the slots and fees again). */
export async function updateLead(branch: BranchKey, leadId: string, input: any, actor: { id: string; name?: string }) {
  await dbConnect();
  if (!Types.ObjectId.isValid(leadId)) throw new BranchError("Not found.", 404);
  const lead: any = await BranchLead.findOne({ _id: leadId, branch }).lean();
  if (!lead) throw new BranchError("Not found.", 404);
  if (input?.action === "resend") {
    const sent = await sendSlotsAndFees(branch, lead);
    const fresh: any = await BranchLead.findById(leadId).lean();
    return { lead: serializeLead(fresh), whatsappLink: sent.whatsappLink, message: sent.message };
  }
  if (input?.action === "message") {
    const { message } = await slotsAndFeesMessage(branch, lead.name);
    const india = !lead.countryCode || lead.countryCode === "+91";
    return { lead: serializeLead(lead), message, whatsappLink: india ? whatsAppChatLink(lead.phone, message) : "" };
  }
  const set: Record<string, unknown> = { updatedByName: actor.name || "" };
  if (input?.status !== undefined) {
    if (!LEAD_STATUSES.includes(input.status)) throw new BranchError("Choose a valid status.");
    set.status = input.status;
  }
  if (input?.note !== undefined) set.note = text(input.note, 1000);
  await BranchLead.updateOne({ _id: leadId, branch }, { $set: set });
  const fresh: any = await BranchLead.findById(leadId).lean();
  return { lead: serializeLead(fresh) };
}

/** Called when an admission form is sent from a lead. */
export async function markLeadConverted(branch: BranchKey, leadId: unknown, admissionId: unknown, actorName?: string) {
  if (typeof leadId !== "string" || !Types.ObjectId.isValid(leadId)) return;
  await BranchLead.updateOne(
    { _id: leadId, branch },
    { $set: { status: "converted", admission: admissionId, convertedAt: new Date(), updatedByName: actorName || "" } }
  );
}

// ---------------------------------------------------------------------------
// Public waitlist
// ---------------------------------------------------------------------------

/** A family joins a full slot's waitlist from the centre page. */
export async function joinWaitlistFromWebsite(branch: BranchKey, input: any) {
  await dbConnect();
  const slotId = String(input?.slotId || "");
  if (!Types.ObjectId.isValid(slotId)) throw new BranchError("Pick a batch.");
  const slots = await publicSlots(branch);
  const slot = slots.find((entry) => entry.id === slotId);
  if (!slot) throw new BranchError("That batch is no longer running. Please pick another.");
  const name = text(input?.childName, 120);
  if (!name) throw new BranchError("Enter the child's name.");
  const parentName = text(input?.parentName, 120);
  if (!parentName) throw new BranchError("Enter the parent's name.");
  const phone = tenDigitPhone(input?.phone);
  if (!phone) throw new BranchError("Enter a 10-digit mobile number.");
  const email = text(input?.email, 200).toLowerCase();
  if (!email || !realEmail(email)) throw new BranchError("Enter a valid email address.");

  const label = BRANCH_LABELS[branch];
  const already = await BranchWaitlist.exists({ branch, slot: slotId, phone, status: "waiting" });
  if (already) return { slotLabel: slot.label, already: true, free: slot.free };

  const entry: any = await BranchWaitlist.create({
    branch,
    slot: slotId,
    name,
    parentName,
    phone,
    email,
    note: text(input?.note, 300),
    source: "website",
    createdByName: "Website",
  });
  const position = await BranchWaitlist.countDocuments({ branch, slot: slotId, status: "waiting", createdAt: { $lte: entry.createdAt } });

  void sendAutomationEmail({
    to: email,
    subject: `You're on the waitlist: ${slot.label} at Envision Chess Academy ${label}`,
    message: [
      `Hello ${parentName},`,
      "",
      `${name} is on the waitlist for the ${slot.label} batch at our ${label} centre (number ${position} in the queue).`,
      "We will message you on WhatsApp and email as soon as a seat in this batch is free.",
      "",
      `Live seats: ${CENTRE_PAGE_URL[branch]}`,
      "",
      "Team Envision Chess Academy",
    ].join("\n"),
    actionUrl: CENTRE_PAGE_URL[branch],
    actionLabel: "See live seats",
    metadata: { kind: "branch_waitlist_joined", dedupKey: `branch-waitlist-joined:${id(entry)}` },
  }).catch(() => null);

  await notifyBranchRunners(branch, {
    type: "branch_waitlist_joined",
    title: `${name} joined the waitlist for ${slot.label}`,
    message: `${parentName} · ${phone} · ${email}. Joined from the website; number ${position} in the queue.`,
    href: "/bowbazar/waitlist",
    metadata: { slotId, waitlistId: id(entry) },
  });
  void emailBranchRunners(branch, {
    subject: `Waitlist: ${name} for ${slot.label} (${label})`,
    message: [
      `${name} joined the waitlist for ${slot.label} from the website.`,
      "",
      `Parent: ${parentName}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      `Queue position: ${position}`,
    ].join("\n"),
    href: "/bowbazar/waitlist",
    dedupKey: `branch-waitlist-staff:${id(entry)}`,
  });
  return { slotLabel: slot.label, already: false, position, free: slot.free };
}

/**
 * A seat freed in a slot with families waiting: message each of them (once a
 * day at most) by email and WhatsApp. Returns how many were told.
 */
export async function tellWaitingFamilies(branch: BranchKey, slot: any, free: number) {
  const dayAgo = new Date(Date.now() - 20 * 3600 * 1000);
  const waiting: any[] = await BranchWaitlist.find({
    branch,
    slot: slot._id,
    status: "waiting",
    $or: [{ notifiedAt: { $exists: false } }, { notifiedAt: null }, { notifiedAt: { $lt: dayAgo } }],
  })
    .sort({ createdAt: 1 })
    .lean();
  const label = BRANCH_LABELS[branch];
  const time = slotLabel(slot);
  let told = 0;
  for (const entry of waiting) {
    const email = realEmail(entry.email);
    const phone = tenDigitPhone(entry.phone);
    if (!email && !phone) continue;
    const metadata = { kind: "branch_waitlist_seat_free", waitlistId: id(entry), dedupKey: `branch-seat-free:${id(entry)}:${new Date().toISOString().slice(0, 10)}` };
    await Promise.all([
      email
        ? sendAutomationEmail({
            to: email,
            subject: `A seat is free: ${time} at Envision Chess Academy ${label}`,
            message: [
              `Hello ${entry.parentName || "there"},`,
              "",
              `Good news: ${free === 1 ? "a seat has" : `${free} seats have`} opened up in the ${time} batch at our ${label} centre, which ${entry.name} is waiting for.`,
              `Seats go to the first family to confirm, so please call or WhatsApp us on ${getCentrePage("bowbazar")?.phoneDisplay || "the centre number"} to take it.`,
              "",
              "Team Envision Chess Academy",
            ].join("\n"),
            actionUrl: CENTRE_PAGE_URL[branch],
            actionLabel: "See live seats",
            metadata,
          }).catch(() => null)
        : null,
      phone
        ? sendWhatsAppAutomationTemplate({
            to: `91${phone}`,
            templateName: "bowbazar_waitlist_seat_free",
            bodyParameters: [entry.parentName || "Parent", entry.name, time, CENTRE_PAGE_URL[branch]],
            metadata,
          }).catch(() => null)
        : null,
    ]);
    await BranchWaitlist.updateOne({ _id: entry._id }, { $set: { notifiedAt: new Date() }, $inc: { notifyCount: 1 } });
    told += 1;
  }
  return told;
}
