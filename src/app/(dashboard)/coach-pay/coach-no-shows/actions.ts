"use server";

import { revalidatePath } from "next/cache";
import { Types, isValidObjectId } from "mongoose";

import { recordActivity } from "@/lib/activity";
import { requireCoachNoShowRuler } from "@/lib/coachPayAccess";
import { notifyCoachOfNoShowRuling, notifyFamiliesOfCoachNoShow } from "@/lib/coachNoShowNotifications";
import { dbConnect } from "@/lib/db";
import { resolveCoachNoShowRulingTask } from "@/lib/tasks/taskTriggers";
import { effectiveSessionCoachId, scheduledStartDate } from "@/lib/teachingStats";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { CoachNoShowRuling } from "@/models/CoachPay";
import { CreditLedger, FeeAssignment } from "@/models/Fee";
import { User } from "@/models/User";

export type CoachNoShowActionResult = { ok: true; message: string } | { ok: false; error: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** Ledger keys for this feature. Every movement is keyed on the missed class. */
const COMPENSATION = "coach_no_show_compensation";
const COMPENSATION_REVERSAL = "coach_no_show_compensation_reversal";
const MISSED_CLASS_REFUND = "coach_no_show_refund";

type Compensation = { student: any; action: "credited" | "reversed" | "none"; credits: number; balanceAfter: number; ledger?: any };

/**
 * One credit movement on a credit-plan student, made safe against a ruling
 * saved twice at once: the balance moves first, and if the ledger row loses
 * the race on its unique key the balance is put back.
 */
async function moveCredit(input: {
  assignment: any;
  studentId: string;
  credits: 1 | -1;
  sourceType: string;
  sourceId: Types.ObjectId;
  actorId: string;
  actorRole: string;
  note: string;
}) {
  const filter: Record<string, any> = { _id: input.assignment._id };
  // A reversal never takes a balance below zero.
  if (input.credits < 0) filter.creditBalance = { $gte: 1 };
  const updated: any = await FeeAssignment.findOneAndUpdate(filter, { $inc: { creditBalance: input.credits } }, { new: true }).lean();
  if (!updated) return null;
  const balanceAfter = Number(updated.creditBalance || 0);
  const ledger = await CreditLedger.create({
    student: input.studentId,
    assignment: input.assignment._id,
    type: "adjustment",
    credits: input.credits,
    balanceAfter,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    source: "coach_no_show",
    performedBy: input.actorId,
    performedByRole: input.actorRole === "sub-admin" ? "sub-admin" : "admin",
    note: input.note,
  }).catch(async (error: any) => {
    await FeeAssignment.findByIdAndUpdate(input.assignment._id, { $inc: { creditBalance: -input.credits } }).catch(() => null);
    if (error?.code !== 11000) throw error;
    return null;
  });
  return ledger ? { ledger, balanceAfter } : null;
}

/**
 * The family half of the ruling.
 *
 * - Any credit taken for the missed class itself (a class first saved as
 *   taught, then corrected) is returned: the family never pays for it.
 * - "Free next class" adds one make-up credit per credit-plan student, so the
 *   next class costs them nothing. Turning it off later takes that credit
 *   back if it is still there.
 */
async function applyCompensation(input: {
  classroomId: string;
  sessionId: string;
  studentIds: string[];
  freeNextClass: boolean;
  actorId: string;
  actorRole: string;
  classLabel: string;
}): Promise<Compensation[]> {
  const results: Compensation[] = [];
  const classKey = new Types.ObjectId(input.sessionId);
  const attendance: any = await Attendance.findOne({ classroom: input.classroomId, scheduledSessionId: input.sessionId }).select("_id").lean();

  for (const studentId of input.studentIds) {
    const assignment: any = await FeeAssignment.findOne({ student: studentId, type: "credits" }).lean();
    if (!assignment) {
      results.push({ student: studentId, action: "none", credits: 0, balanceAfter: 0 });
      continue;
    }

    if (attendance?._id) {
      const charged = await CreditLedger.exists({ student: studentId, type: "attendance_consumption", sourceType: "Attendance", sourceId: attendance._id });
      const refunded = await CreditLedger.exists({ student: studentId, sourceType: MISSED_CLASS_REFUND, sourceId: classKey });
      if (charged && !refunded) {
        await moveCredit({
          assignment, studentId, credits: 1, sourceType: MISSED_CLASS_REFUND, sourceId: classKey,
          actorId: input.actorId, actorRole: input.actorRole,
          note: `Credit returned: the coach missed the ${input.classLabel} class`,
        });
        await FeeAssignment.updateOne({ _id: assignment._id, totalCreditsConsumed: { $gte: 1 } }, { $inc: { totalCreditsConsumed: -1 } }).catch(() => null);
      }
    }

    const [given, reversed] = await Promise.all([
      CreditLedger.exists({ student: studentId, sourceType: COMPENSATION, sourceId: classKey }),
      CreditLedger.exists({ student: studentId, sourceType: COMPENSATION_REVERSAL, sourceId: classKey }),
    ]);
    const current: any = await FeeAssignment.findById(assignment._id).select("creditBalance").lean();
    const balance = Number(current?.creditBalance || 0);

    if (input.freeNextClass && !given) {
      const moved = await moveCredit({
        assignment, studentId, credits: 1, sourceType: COMPENSATION, sourceId: classKey,
        actorId: input.actorId, actorRole: input.actorRole,
        note: `Free make-up class: the coach missed the ${input.classLabel} class`,
      });
      results.push(moved
        ? { student: studentId, action: "credited", credits: 1, balanceAfter: moved.balanceAfter, ledger: moved.ledger._id }
        : { student: studentId, action: "none", credits: 0, balanceAfter: balance });
      continue;
    }
    if (input.freeNextClass && given && !reversed) {
      results.push({ student: studentId, action: "credited", credits: 1, balanceAfter: balance });
      continue;
    }
    if (!input.freeNextClass && given && !reversed) {
      const moved = await moveCredit({
        assignment, studentId, credits: -1, sourceType: COMPENSATION_REVERSAL, sourceId: classKey,
        actorId: input.actorId, actorRole: input.actorRole,
        note: "Free make-up class withdrawn by a changed ruling",
      });
      results.push(moved
        ? { student: studentId, action: "reversed", credits: -1, balanceAfter: moved.balanceAfter, ledger: moved.ledger._id }
        : { student: studentId, action: "credited", credits: 1, balanceAfter: balance });
      continue;
    }
    // Given and then withdrawn: the ledger keeps one of each per class, so a
    // second change of mind is a manual credit, not an automatic one.
    results.push({ student: studentId, action: given && reversed ? "reversed" : "none", credits: 0, balanceAfter: balance });
  }
  return results;
}

/**
 * Save an admin's or sub-admin's ruling on a class the coach missed, and act
 * on it: credits for the family, a fine line on the coach's pay, the free
 * class worked out by the pay engine, and messages to the family and coach.
 */
export async function saveCoachNoShowRuling(formData: FormData): Promise<CoachNoShowActionResult> {
  const session = await requireCoachNoShowRuler();
  if (!session?.user) return { ok: false, error: "Only admins and sub-admins can rule on a coach no-show." };
  await dbConnect();

  const classroomId = text(formData, "classroom");
  const sessionId = text(formData, "sessionId");
  if (!isValidObjectId(classroomId) || !isValidObjectId(sessionId)) return { ok: false, error: "Unknown class." };

  const chargeFine = text(formData, "chargeFine") === "yes";
  const fineRupees = Number(text(formData, "fineAmount") || 0);
  if (chargeFine && (!Number.isFinite(fineRupees) || fineRupees <= 0)) return { ok: false, error: "Enter the fine amount in rupees, or untick the fine." };
  if (chargeFine && fineRupees > 100_000) return { ok: false, error: "That fine looks too large. Check the amount." };
  const fineAmount = chargeFine ? Math.round(fineRupees * 100) : 0;
  const freeNextClass = text(formData, "freeNextClass") === "yes";
  const sendMessages = text(formData, "notify") === "yes";
  const note = text(formData, "note").slice(0, 1000);
  const actorId = String((session.user as any).id);
  const actorRole = String((session.user as any).role);

  // Everything about the class is read from the database, not the form.
  const classroom: any = await Classroom.findById(classroomId)
    .select("title coach instructor students generatedSessions classDate startDate startTime durationMinutes")
    .lean();
  const target = (classroom?.generatedSessions || []).find((item: any) => idOf(item._id) === sessionId);
  if (!classroom || !target) return { ok: false, error: "That class no longer exists." };
  if (String(target.status || "") !== "coach_no_show") {
    return { ok: false, error: "This class is not marked as a coach no-show any more. Refresh the page." };
  }
  const coachId = effectiveSessionCoachId(target, classroom);
  if (!coachId) return { ok: false, error: "No coach is recorded on this class." };
  const sessionDate = scheduledStartDate(target, classroom);
  const roster = ((target.students?.length ? target.students : classroom.students) || []).map(idOf).filter(Boolean);
  const activeStudents = (await User.find({ _id: { $in: roster }, role: "student", isActive: { $ne: false } }).select("_id").lean()).map((row: any) => idOf(row._id));
  const classLabel = String(classroom.title || "chess").trim();
  const coach: any = await User.findById(coachId).select("name username").lean();

  const previous: any = await CoachNoShowRuling.findOne({ classroom: classroomId, sessionId }).lean();

  const compensation = await applyCompensation({
    classroomId,
    sessionId,
    studentIds: activeStudents,
    freeNextClass,
    actorId,
    actorRole,
    classLabel,
  });

  const saved: any = await CoachNoShowRuling.findOneAndUpdate(
    { classroom: new Types.ObjectId(classroomId), sessionId },
    {
      classroom: new Types.ObjectId(classroomId),
      sessionId,
      sessionDate,
      coach: new Types.ObjectId(coachId),
      classroomTitle: classLabel,
      coachName: coach?.name || coach?.username || "",
      chargeFine,
      fineAmount,
      freeNextClass,
      compensation,
      note,
      decidedBy: actorId,
      decidedByRole: actorRole === "sub-admin" ? "sub-admin" : "admin",
      decidedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const rulingId = idOf(saved?._id);

  let messaged = "";
  if (sendMessages) {
    const credited = compensation.filter((entry) => entry.action === "credited").map((entry) => idOf(entry.student));
    // Families hear once. A changed ruling does not send a second apology,
    // unless the first ruling had no free class and this one adds it.
    const familiesDue = !previous?.familiesNotifiedAt || (freeNextClass && !previous?.freeNextClass);
    if (familiesDue) {
      await notifyFamiliesOfCoachNoShow({ rulingId, classroomId, classLabel, sessionDate, studentIds: activeStudents, creditedStudentIds: credited, freeNextClass })
        .catch((error) => console.error("Coach no-show family messages failed", error));
    }
    await notifyCoachOfNoShowRuling({ rulingId, classroomId, coachId, classLabel, sessionDate, chargeFine, fineAmount, freeNextClass, note })
      .catch((error) => console.error("Coach no-show coach message failed", error));
    await CoachNoShowRuling.updateOne(
      { _id: saved._id },
      { $set: { coachNotifiedAt: new Date(), ...(familiesDue ? { familiesNotifiedAt: new Date() } : {}) } }
    );
    messaged = familiesDue ? " The family and the coach have been messaged." : " The coach has been messaged (the family was told earlier).";
  }

  await resolveCoachNoShowRulingTask(sessionId, actorId);
  await recordActivity({
    actor: actorId,
    targetUser: coachId,
    type: "coachPay.coachNoShow.ruled",
    label: `Ruled a coach no-show: ${chargeFine ? `fine Rs ${fineRupees}` : "no fine"}, next class ${freeNextClass ? "free" : "charged as usual"}`,
    entityType: "CoachNoShowRuling",
    entityId: rulingId,
    metadata: { classroomId, sessionId, chargeFine, fineAmount, freeNextClass, note, compensation, sendMessages },
  });

  revalidatePath("/coach-pay");
  revalidatePath("/coach-pay/coach-no-shows");
  const credits = compensation.filter((entry) => entry.action === "credited").length;
  return {
    ok: true,
    message: `Ruling saved.${freeNextClass ? ` ${credits} student${credits === 1 ? "" : "s"} got a free-class credit.` : ""}${messaged}`,
  };
}

/**
 * Resend just the WhatsApp messages of a saved ruling: the family's and the
 * coach's. For when the first send failed (a template Meta had not approved
 * yet, say). The in-app notice and email are not sent a second time.
 */
export async function resendCoachNoShowWhatsApp(formData: FormData): Promise<CoachNoShowActionResult> {
  const session = await requireCoachNoShowRuler();
  if (!session?.user) return { ok: false, error: "Only admins and sub-admins can resend these messages." };
  await dbConnect();

  const classroomId = text(formData, "classroom");
  const sessionId = text(formData, "sessionId");
  if (!isValidObjectId(classroomId) || !isValidObjectId(sessionId)) return { ok: false, error: "Unknown class." };
  const ruling: any = await CoachNoShowRuling.findOne({ classroom: classroomId, sessionId }).lean();
  if (!ruling) return { ok: false, error: "Save a ruling on this class first." };

  const classroom: any = await Classroom.findById(classroomId).select("title students generatedSessions").lean();
  const target = (classroom?.generatedSessions || []).find((item: any) => idOf(item._id) === sessionId);
  const roster = ((target?.students?.length ? target.students : classroom?.students) || []).map(idOf).filter(Boolean);
  const activeStudents = (await User.find({ _id: { $in: roster }, role: "student", isActive: { $ne: false } }).select("_id").lean()).map((row: any) => idOf(row._id));
  const classLabel = String(ruling.classroomTitle || classroom?.title || "chess").trim();
  const rulingId = idOf(ruling._id);
  const credited = (ruling.compensation || []).filter((entry: any) => entry.action === "credited").map((entry: any) => idOf(entry.student));

  const family = await notifyFamiliesOfCoachNoShow({
    rulingId, classroomId, classLabel, sessionDate: ruling.sessionDate, studentIds: activeStudents,
    creditedStudentIds: credited, freeNextClass: Boolean(ruling.freeNextClass), whatsappOnly: true,
  });
  const coach = await notifyCoachOfNoShowRuling({
    rulingId, classroomId, coachId: idOf(ruling.coach), classLabel, sessionDate: ruling.sessionDate,
    chargeFine: Boolean(ruling.chargeFine), fineAmount: Number(ruling.fineAmount || 0), freeNextClass: Boolean(ruling.freeNextClass),
    note: ruling.note || "", whatsappOnly: true,
  });

  const ok = family.whatsappOk + coach.whatsappOk;
  const failed = family.whatsappFailed + coach.whatsappFailed;
  const errors = [...family.errors, ...coach.errors];
  const now = new Date();
  await CoachNoShowRuling.updateOne(
    { _id: ruling._id },
    { $set: { ...(family.whatsappOk ? { familiesNotifiedAt: now } : {}), ...(coach.whatsappOk ? { coachNotifiedAt: now } : {}) } }
  );
  await recordActivity({
    actor: String((session.user as any).id),
    targetUser: idOf(ruling.coach),
    type: "coachPay.coachNoShow.whatsappResent",
    label: `Resent coach no-show WhatsApp: ${ok} sent, ${failed} failed`,
    entityType: "CoachNoShowRuling",
    entityId: rulingId,
    metadata: { classroomId, sessionId, ok, failed, errors },
  });
  revalidatePath("/coach-pay/coach-no-shows");

  if (!ok && failed) return { ok: false, error: `WhatsApp not sent. ${errors.slice(0, 3).join("; ")}` };
  return { ok: true, message: `WhatsApp sent to ${ok} recipient${ok === 1 ? "" : "s"}.${failed ? ` ${failed} failed: ${errors.slice(0, 3).join("; ")}` : ""}` };
}
