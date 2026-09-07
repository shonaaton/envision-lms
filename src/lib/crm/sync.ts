import { recordActivity } from "@/lib/activity";
import { isCrmConfigured, pushLeadStage } from "@/lib/crm/client";
import { contactKeysForUser, crmPhoneNumber } from "@/lib/crm/identity";
import { cancelDemoClassrooms } from "@/lib/demoClassroom";
import { DEMO_MANAGEMENT_HREF, notifyDemoReopened } from "@/lib/demoWorkflow";
import { crmStageLabel, demoStatusToStage, isClosureStage, type DemoStage } from "@/lib/crm/stages";
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
    // Always relink to the account we just resolved from the booking. Keeping a
    // previous id would strand the lead on a deleted or superseded account when
    // someone re-registers on the same phone number.
    existing.user = user._id;
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
    .select("bookingType demoStatus student startAt requestedIstDateTime cancellationReason")
    .populate("student", "name email phone countryCode accountStatus")
    .lean();
  if (!booking || booking.bookingType !== "demo") return { ok: false, skipped: true, reason: "Not a demo booking." };

  const stage = demoStatusToStage(booking.demoStatus, booking.cancellationReason);
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
    // The CRM has only two dead stages against seven portal close reasons, so the
    // exact reason rides along in the note rather than being lost in the mapping.
    note: isClosureStage(stage)
      ? `Demo closed on the portal: ${booking.cancellationReason || "no reason recorded"}`
      : `Portal demo update: ${crmStageLabel(stage)}${booking.requestedIstDateTime ? ` (${booking.requestedIstDateTime})` : ""}`,
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

  // The demo classroom must go with the booking, or the coach keeps an upcoming
  // class for a lead the CRM has already written off.
  await cancelDemoClassrooms({ bookingIds: bookings.map((booking) => booking._id), reason }).catch(() => undefined);

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

const DEMO_ACCESS_EXTENSION_DAYS = 14;

/**
 * CRM moved the lead back into a demo stage after it had been closed.
 *
 * Closure was previously one-way: sales could kill a demo from the CRM but not
 * revive it, leaving the lead sitting in a demo stage with nothing on the portal
 * for anyone to action. This reopens it to REQUESTED so it returns to the Demo
 * Center queue. A live demo is never touched - only a closed one is revived, so
 * the portal still owns the outcome of demos that are actually running.
 */
export async function reopenDemoFromCrm(input: { userId: string; stageName: string; crmLeadId?: string }) {
  const active = await Booking.exists({
    student: input.userId,
    bookingType: "demo",
    demoStatus: { $in: OPEN_DEMO_STATUSES },
  });
  if (active) return { reopened: false, reason: "An active demo already exists." };

  const booking: any = await Booking.findOne({
    student: input.userId,
    bookingType: "demo",
    demoStatus: { $in: ["CLOSED", "CANCELLED"] },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (!booking) return { reopened: false, reason: "No closed demo to reopen." };

  await Booking.findByIdAndUpdate(booking._id, {
    status: "pending",
    approvalStatus: "pending_admin",
    demoStatus: "REQUESTED",
    feedbackStatus: "not_required",
    needsNewTime: true,
    reopenedAt: new Date(),
    reopenedFromStage: input.stageName,
    // Carry the old reason across before clearing it, so whoever rings the parent
    // back knows why the demo was dropped the first time.
    previousCloseReason: booking.cancellationReason || "",
    $unset: { cancellationReason: "" },
  });

  // The demo account has usually expired by the time a lead is revived, so give
  // it a fresh window or the student cannot log in for the rescheduled class.
  const user: any = await User.findById(input.userId).select("name accountStatus demoExpiresAt").lean();
  if (user?.accountStatus === "demo") {
    const now = new Date();
    const base = user.demoExpiresAt && new Date(user.demoExpiresAt).getTime() > now.getTime() ? new Date(user.demoExpiresAt) : now;
    await User.findByIdAndUpdate(input.userId, {
      demoExpiresAt: new Date(base.getTime() + DEMO_ACCESS_EXTENSION_DAYS * 24 * 60 * 60 * 1000),
    }).catch(() => undefined);
  }

  await InternalTask.findOneAndUpdate(
    { referenceType: "DemoBooking", referenceId: booking._id },
    {
      $set: {
        title: `Reschedule reopened demo - ${user?.name || "Prospect"}`,
        details: [
          `${user?.name || "This lead"} was moved back to "${input.stageName}" in the CRM, so the closed demo has been reopened.`,
          "The original slot has passed - agree a new time and confirm it from the Demo Center.",
        ].join("\n"),
        status: "pending",
        priority: "high",
        actionHref: DEMO_MANAGEMENT_HREF,
      },
    },
    { upsert: true }
  ).catch(() => undefined);

  const admins: any[] = await User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } })
    .select("_id")
    .lean();
  await Notification.insertMany(
    admins.map((admin) => ({
      user: admin._id,
      type: "crm.demo.reopened",
      title: "Demo reopened from CRM",
      message: `${user?.name || "A lead"} was moved back to "${input.stageName}" in the CRM. Their demo is reopened and needs a new time.`,
      metadata: { studentId: input.userId, booking: booking._id, href: DEMO_MANAGEMENT_HREF, source: "crm" },
    }))
  ).catch(() => undefined);

  // The sub-admin has to act on this - nobody is watching the Demo Center for a
  // reopened demo, and its original slot has already passed.
  await notifyDemoReopened({
    studentId: input.userId,
    bookingId: idOf(booking._id),
    stageName: input.stageName,
  }).catch((error) => console.error("Demo reopened notification failed", error));

  await recordActivity({
    targetUser: input.userId,
    type: "demo.booking.reopened",
    label: "Reopened demo from CRM",
    entityType: "Booking",
    entityId: idOf(booking._id),
    metadata: { source: "crm", crmStage: input.stageName, crmLeadId: input.crmLeadId || "", event: "DEMO_REOPENED" },
  });

  return { reopened: true, bookingId: idOf(booking._id) };
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
