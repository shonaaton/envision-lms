import { recordActivity } from "@/lib/activity";
import { isCrmConfigured, pushLeadStage } from "@/lib/crm/client";
import { contactKeysForUser, crmPhoneNumber } from "@/lib/crm/identity";
import { crmStageLabel, demoStatusToStage, type DemoStage } from "@/lib/crm/stages";
import { dbConnect } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { CrmLead } from "@/models/CrmLead";
import { InternalTask } from "@/models/InternalTask";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

const HISTORY_LIMIT = 40;

export type CrmSyncOutcome = { ok: boolean; skipped?: boolean; reason?: string; stage?: DemoStage };

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** Demo states that still represent a live lead the CRM is allowed to close. */
const OPEN_DEMO_STATUSES = [
  "REQUESTED",
  "COACH_ASSIGNED",
  "APPROVED",
  "CLASSROOM_CREATED",
  "ASSESSMENT_PENDING",
  "COMPLETED",
  "STUDENT_NO_SHOW",
  "ABSENT",
  "RESCHEDULE_REQUESTED",
];

async function resolveLead(user: any) {
  const keys = contactKeysForUser(user);
  const or: any[] = [{ user: user._id }];
  if (keys.phoneKey) or.push({ phoneKey: keys.phoneKey });
  if (keys.emailKey) or.push({ emailKey: keys.emailKey });

  const existing = await CrmLead.findOne({ $or: or });
  if (existing) {
    existing.user = existing.user || user._id;
    existing.name = user.name || existing.name;
    if (keys.phoneKey) existing.phoneKey = keys.phoneKey;
    if (keys.emailKey) existing.emailKey = keys.emailKey;
    return existing;
  }
  return CrmLead.create({
    user: user._id,
    name: user.name,
    phoneKey: keys.phoneKey,
    emailKey: keys.emailKey,
  });
}

function appendHistory(lead: any, entry: { direction: "outbound" | "inbound"; stage?: string; ok?: boolean; note?: string }) {
  const history = Array.isArray(lead.history) ? lead.history : [];
  lead.history = [...history, { ...entry, at: new Date() }].slice(-HISTORY_LIMIT);
}

/**
 * Push a demo booking current stage to the CRM.
 *
 * Idempotent by design: the stage is compared against `lastPushedStage` before
 * any HTTP call, so repeated saves, CRM retries, and writes that originated from
 * an inbound webhook all collapse to a no-op instead of looping.
 */
export async function syncBookingStageToCrm(bookingId: string): Promise<CrmSyncOutcome> {
  if (!bookingId) return { ok: false, skipped: true, reason: "No booking id." };
  await dbConnect();

  const booking: any = await Booking.findById(bookingId)
    .select("bookingType demoStatus student startAt requestedIstDateTime")
    .populate("student", "name email phone countryCode accountStatus")
    .lean();
  if (!booking || booking.bookingType !== "demo") return { ok: false, skipped: true, reason: "Not a demo booking." };

  const stage = demoStatusToStage(booking.demoStatus);
  if (!stage) return { ok: false, skipped: true, reason: `Stage ${booking.demoStatus} is not pushed to the CRM.` };

  const student = booking.student;
  if (!student?._id) return { ok: false, skipped: true, reason: "Demo booking has no student." };

  const lead = await resolveLead(student);
  if (lead.syncEnabled === false) return { ok: false, skipped: true, reason: "Sync disabled for this lead." };
  if (lead.lastPushedStage === stage) return { ok: true, skipped: true, reason: "Stage already pushed.", stage };

  const result = await pushLeadStage({
    crmLeadId: lead.crmLeadId,
    name: student.name,
    phone: crmPhoneNumber(student),
    email: student.email,
    stage,
    note: `Portal demo update: ${crmStageLabel(stage)}${booking.requestedIstDateTime ? ` (${booking.requestedIstDateTime})` : ""}`,
  });

  if (result.ok) {
    lead.lastPushedStage = stage;
    lead.lastPushedAt = new Date();
    lead.lastPushError = undefined;
    if (result.leadId) lead.crmLeadId = result.leadId;
    appendHistory(lead, { direction: "outbound", stage, ok: true });
  } else {
    lead.lastPushError = result.reason;
    appendHistory(lead, { direction: "outbound", stage, ok: false, note: result.reason });
  }
  await lead.save().catch(() => undefined);

  if (result.ok) {
    await recordActivity({
      targetUser: idOf(student._id),
      type: "crm.stage.pushed",
      label: `CRM stage set to ${crmStageLabel(stage)}`,
      entityType: "Booking",
      entityId: idOf(booking._id),
      metadata: { stage, crmLeadId: lead.crmLeadId || "" },
    });
  }

  return result.ok
    ? { ok: true, stage }
    : { ok: false, skipped: Boolean((result as any).skipped), reason: result.reason, stage };
}

/** Fire-and-forget wrapper for the model hooks. CRM sync must never break a save. */
export function queueBookingStageSync(bookingId: string) {
  if (!bookingId || !isCrmConfigured()) return;
  void syncBookingStageToCrm(bookingId).catch((error) => {
    console.error("CRM stage sync failed", bookingId, error);
  });
}

/**
 * CRM moved the lead out of the demo pipeline (dead, no response, or any other
 * non-demo stage). Close the open demo on the portal. The account itself stays
 * active so sales can revive the lead without an admin recreating it.
 */
export async function closeDemoFromCrm(input: { userId: string; stageName: string; crmLeadId?: string }) {
  const bookings: any[] = await Booking.find({
    student: input.userId,
    bookingType: "demo",
    demoStatus: { $in: OPEN_DEMO_STATUSES },
  })
    .select("_id demoStatus")
    .lean();
  if (!bookings.length) return { closed: 0 };

  const reason = `Closed from CRM (stage: ${input.stageName})`;
  await Booking.updateMany(
    { _id: { $in: bookings.map((booking) => booking._id) } },
    { status: "cancelled", approvalStatus: "rejected", demoStatus: "CLOSED", cancellationReason: reason }
  );

  await Promise.all(
    bookings.map((booking) =>
      recordActivity({
        targetUser: input.userId,
        type: "demo.booking.closed",
        label: "Closed demo lead from CRM",
        entityType: "Booking",
        entityId: idOf(booking._id),
        metadata: { reason, source: "crm", crmStage: input.stageName, crmLeadId: input.crmLeadId || "", event: "DEMO_CLOSED" },
      })
    )
  );

  // Follow-up tasks for a closed lead are dead work.
  await InternalTask.updateMany(
    {
      referenceType: "DemoBooking",
      referenceId: { $in: bookings.map((booking) => booking._id) },
      status: { $in: ["pending", "in_progress"] },
    },
    { status: "cancelled" }
  ).catch(() => undefined);

  return { closed: bookings.length };
}

/**
 * CRM moved the lead to "Current Student". Sales owns conversion, so the portal
 * follows: the student is marked enrolled and an admin task is raised to fill in
 * the course, batch and start date that the CRM payload does not carry.
 */
export async function convertStudentFromCrm(input: { userId: string; stageName: string; crmLeadId?: string }) {
  const user: any = await User.findById(input.userId).select("name accountStatus conversionSetup").lean();
  if (!user) return { converted: false, reason: "User not found." };

  const booking: any = await Booking.findOne({
    student: input.userId,
    bookingType: "demo",
    demoStatus: { $nin: ["CONVERTED"] },
  })
    .select("_id demoStatus")
    .sort({ startAt: -1 })
    .lean();

  if (user.accountStatus === "enrolled" && !booking) return { converted: false, reason: "Already enrolled." };

  const now = new Date();
  await User.findByIdAndUpdate(input.userId, {
    accountStatus: "enrolled",
    $set: {
      "conversionSetup.convertedAt": user.conversionSetup?.convertedAt || now,
      ...(booking?._id ? { "conversionSetup.convertedFromBooking": booking._id } : {}),
    },
    $pull: { tags: "demo" },
  });

  if (booking?._id) await Booking.findByIdAndUpdate(booking._id, { demoStatus: "CONVERTED" });

  // Course, batch and start date are not in the CRM payload, so an admin still
  // has to finish the setup. Make that an explicit, tracked task.
  if (booking?._id) {
    await InternalTask.findOneAndUpdate(
      { referenceType: "DemoConversion", referenceId: booking._id },
      {
        $setOnInsert: {
          title: `Complete enrolment setup - ${user.name || "Student"}`,
          details: [
            `${user.name || "This student"} was moved to "${input.stageName}" in the CRM.`,
            "Assign the course, batch, starting date and recommended level in the Demo Center.",
          ].join("\n"),
          status: "pending",
          priority: "high",
          referenceType: "DemoConversion",
          referenceId: booking._id,
          actionHref: "/admin/demo-center",
          metadata: { source: "crm", crmLeadId: input.crmLeadId || "", studentId: input.userId },
        },
      },
      { upsert: true }
    ).catch(() => undefined);
  }

  const admins: any[] = await User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } })
    .select("_id")
    .lean();
  await Notification.insertMany(
    admins.map((admin) => ({
      user: admin._id,
      type: "crm.demo.converted",
      title: "Lead converted in CRM",
      message: `${user.name || "A student"} was moved to "${input.stageName}" in the CRM. Assign their course and batch.`,
      metadata: { studentId: input.userId, href: "/admin/demo-center", source: "crm" },
    }))
  ).catch(() => undefined);

  await recordActivity({
    targetUser: input.userId,
    type: "demo.converted.crm",
    label: "Converted from CRM",
    entityType: "User",
    entityId: input.userId,
    metadata: { source: "crm", crmStage: input.stageName, crmLeadId: input.crmLeadId || "", event: "DEMO_CONVERTED" },
  });

  return { converted: true, bookingId: idOf(booking?._id) };
}
