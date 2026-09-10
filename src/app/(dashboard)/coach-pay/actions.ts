"use server";

import { revalidatePath } from "next/cache";
import { Types, isValidObjectId } from "mongoose";

import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { consumeAttendanceCredit } from "@/lib/fees";
import { requireCoachPayPermission } from "@/lib/coachPayAccess";
import { isValidRateScope } from "@/lib/coachPay";
import { CoachRate, NoShowRuling, SessionPayOverride, PAY_KINDS, RATE_UNITS } from "@/models/CoachPay";
import { Attendance } from "@/models/Attendance";
import { CreditLedger, FeeAssignment } from "@/models/Fee";

/**
 * Everything that changes what a coach is owed.
 *
 * All three mutations are permissioned separately from reading the report:
 * seeing the wage bill and deciding it are different jobs.
 */

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

/**
 * Rupees typed by a human into paise.
 *
 * An empty box is `null`, not `0`. That distinction is the whole rate ladder:
 * null means "this card does not price that, look further down", while 0 means
 * "this card prices it at nothing".
 */
function paise(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const rupees = Number(raw);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

function unit(formData: FormData, key: string) {
  const raw = text(formData, key);
  return (RATE_UNITS as readonly string[]).includes(raw) ? raw : "per_class";
}

function rateValue(formData: FormData, kind: string) {
  return { amount: paise(formData, `${kind}Amount`), unit: unit(formData, `${kind}Unit`) };
}

function refresh() {
  revalidatePath("/coach-pay");
  revalidatePath("/coach-pay/rates");
  revalidatePath("/coach-pay/reviews");
}

export async function saveRateCard(formData: FormData) {
  const session = await requireCoachPayPermission("manage_rates");
  if (!session?.user) throw new Error("Forbidden");
  await dbConnect();

  const scope = text(formData, "scope");
  if (!isValidRateScope(scope)) throw new Error("Choose a valid rate scope");

  const coach = text(formData, "coach");
  const batch = text(formData, "batch");
  const classroom = text(formData, "classroom");
  const needsCoach = scope === "coach" || scope === "batch_coach" || scope === "classroom_coach";
  const needsBatch = scope === "batch" || scope === "batch_coach";
  const needsClassroom = scope === "classroom" || scope === "classroom_coach";
  if (needsCoach && !isValidObjectId(coach)) throw new Error("Choose the coach this rate applies to");
  if (needsBatch && !isValidObjectId(batch)) throw new Error("Choose the batch this rate applies to");
  if (needsClassroom && !isValidObjectId(classroom)) throw new Error("Choose the classroom this rate applies to");

  const effectiveRaw = text(formData, "effectiveFrom");
  const effectiveFrom = effectiveRaw ? new Date(`${effectiveRaw}T00:00:00`) : new Date(0);
  if (Number.isNaN(effectiveFrom.getTime())) throw new Error("Enter a valid start date for this rate");

  const values = {
    regular: rateValue(formData, "regular"),
    demo: rateValue(formData, "demo"),
    demoConversionBonus: rateValue(formData, "demoConversionBonus"),
    substitute: rateValue(formData, "substitute"),
  };
  if (Object.values(values).every((value) => value.amount === null)) {
    throw new Error("Enter at least one rate on this card");
  }

  // The key is the scope target plus the start date, so re-saving the same card
  // edits it and a new start date adds a dated successor beside it.
  const key = {
    scope,
    coach: needsCoach ? new Types.ObjectId(coach) : null,
    batch: needsBatch ? new Types.ObjectId(batch) : null,
    classroom: needsClassroom ? new Types.ObjectId(classroom) : null,
    effectiveFrom,
  };

  const saved = await CoachRate.findOneAndUpdate(
    key,
    {
      ...key,
      ...values,
      isActive: true,
      note: text(formData, "note"),
      updatedBy: (session.user as any).id,
      $setOnInsert: { createdBy: (session.user as any).id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await recordActivity({
    actor: (session.user as any).id,
    type: "coachPay.rate.saved",
    label: `Saved a ${scope.replace(/_/g, " ")} coach rate card`,
    entityType: "CoachRate",
    entityId: saved._id.toString(),
    metadata: { scope, coach, batch, classroom, effectiveFrom, ...values },
  });

  refresh();
}

export async function deleteRateCard(formData: FormData) {
  const session = await requireCoachPayPermission("manage_rates");
  if (!session?.user) throw new Error("Forbidden");
  const id = text(formData, "id");
  if (!isValidObjectId(id)) throw new Error("Unknown rate card");
  await dbConnect();

  const removed = await CoachRate.findByIdAndDelete(id).lean();
  if (removed) {
    await recordActivity({
      actor: (session.user as any).id,
      type: "coachPay.rate.deleted",
      label: `Deleted a ${String((removed as any).scope || "").replace(/_/g, " ")} coach rate card`,
      entityType: "CoachRate",
      entityId: id,
      metadata: { card: removed },
    });
  }
  refresh();
}

/**
 * Price one class by hand.
 *
 * This is how a substitution gets its own number when the substitute is not on
 * any standing price list - the admin who arranged the cover types what was
 * agreed, against that class and that coach.
 */
export async function saveSessionOverride(formData: FormData) {
  const session = await requireCoachPayPermission("manage_rates");
  if (!session?.user) throw new Error("Forbidden");
  await dbConnect();

  const classroom = text(formData, "classroom");
  const sessionId = text(formData, "sessionId");
  const coach = text(formData, "coach");
  if (!isValidObjectId(classroom) || !sessionId || !isValidObjectId(coach)) throw new Error("Unknown class");

  const amount = paise(formData, "amount");
  if (amount === null) throw new Error("Enter the amount for this class");
  const kindRaw = text(formData, "kind");
  const kind = (PAY_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "substitute";

  const saved = await SessionPayOverride.findOneAndUpdate(
    { classroom: new Types.ObjectId(classroom), sessionId, coach: new Types.ObjectId(coach) },
    {
      classroom: new Types.ObjectId(classroom),
      sessionId,
      coach: new Types.ObjectId(coach),
      kind,
      amount,
      unit: unit(formData, "unit"),
      reason: text(formData, "reason"),
      updatedBy: (session.user as any).id,
      $setOnInsert: { createdBy: (session.user as any).id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await recordActivity({
    actor: (session.user as any).id,
    targetUser: coach,
    type: "coachPay.override.saved",
    label: `Set a one-off class rate of ${(amount / 100).toFixed(2)}`,
    entityType: "SessionPayOverride",
    entityId: saved._id.toString(),
    metadata: { classroom, sessionId, coach, kind, amount, reason: text(formData, "reason") },
  });

  refresh();
}

export async function deleteSessionOverride(formData: FormData) {
  const session = await requireCoachPayPermission("manage_rates");
  if (!session?.user) throw new Error("Forbidden");
  const id = text(formData, "id");
  if (!isValidObjectId(id)) throw new Error("Unknown override");
  await dbConnect();

  const removed = await SessionPayOverride.findByIdAndDelete(id).lean();
  if (removed) {
    await recordActivity({
      actor: (session.user as any).id,
      type: "coachPay.override.deleted",
      label: "Removed a one-off class rate",
      entityType: "SessionPayOverride",
      entityId: id,
      metadata: { override: removed },
    });
  }
  refresh();
}

type CreditAction = { student: any; action: "deducted" | "refunded" | "none"; credits: number; balanceAfter: number; ledger?: any };

/**
 * Carry out the student half of a no-show ruling.
 *
 * The automatic no-show rule may already have taken a credit before anyone
 * ruled, so "do not charge the student" often means giving one back rather than
 * simply not taking one. Both directions are keyed on the class, and the
 * ledger's unique index is what stops a ruling saved twice from moving credits
 * twice - not a check-then-write that two admins could both pass.
 */
async function applyCreditDecision(input: {
  classroomId: string;
  sessionId: string;
  studentIds: string[];
  deduct: boolean;
  actorId: string;
  actorRole: string;
  reason: string;
}): Promise<CreditAction[]> {
  const actions: CreditAction[] = [];
  if (!input.studentIds.length) return actions;

  const attendance: any = await Attendance.findOne({
    classroom: input.classroomId,
    scheduledSessionId: input.sessionId,
  })
    .select("_id")
    .lean();
  const classKey = isValidObjectId(input.sessionId) ? new Types.ObjectId(input.sessionId) : new Types.ObjectId();

  for (const studentId of input.studentIds) {
    const assignment: any = await FeeAssignment.findOne({ student: studentId, type: "credits" }).lean();
    // Monthly-plan students have no credit balance to argue about.
    if (!assignment) {
      actions.push({ student: studentId, action: "none", credits: 0, balanceAfter: 0 });
      continue;
    }

    const priorDeduction: any = await CreditLedger.findOne({
      student: studentId,
      $or: [
        ...(attendance?._id ? [{ type: "attendance_consumption", sourceType: "Attendance", sourceId: attendance._id }] : []),
        { sourceType: "coach_pay_deduction", sourceId: classKey },
      ],
    }).lean();

    if (input.deduct && !priorDeduction) {
      if (attendance?._id) {
        // Reuse the ordinary consumption path so the balance floor, the
        // low-credit warnings and the activity trail all behave identically.
        await consumeAttendanceCredit(studentId, attendance._id.toString(), input.reason || "Credit deducted by no-show ruling");
        const created: any = await FeeAssignment.findById(assignment._id).select("creditBalance").lean();
        actions.push({ student: studentId, action: "deducted", credits: -1, balanceAfter: Number(created?.creditBalance || 0) });
      } else {
        const updated: any = await FeeAssignment.findOneAndUpdate(
          { _id: assignment._id, creditBalance: { $gte: 0 } },
          { $inc: { creditBalance: -1, totalCreditsConsumed: 1 } },
          { new: true }
        ).lean();
        if (!updated) {
          actions.push({ student: studentId, action: "none", credits: 0, balanceAfter: Number(assignment.creditBalance || 0) });
          continue;
        }
        const ledger = await CreditLedger.create({
          student: studentId,
          assignment: assignment._id,
          type: "adjustment",
          credits: -1,
          balanceAfter: Number(updated.creditBalance || 0),
          sourceType: "coach_pay_deduction",
          sourceId: classKey,
          performedBy: input.actorId,
          performedByRole: input.actorRole,
          note: input.reason || "Credit deducted by no-show ruling",
        }).catch(() => null);
        actions.push({
          student: studentId,
          action: "deducted",
          credits: -1,
          balanceAfter: Number(updated.creditBalance || 0),
          ledger: (ledger as any)?._id,
        });
      }
      continue;
    }

    if (!input.deduct && priorDeduction) {
      const alreadyRefunded = await CreditLedger.exists({
        student: studentId,
        sourceType: "coach_pay_refund",
        sourceId: classKey,
      });
      if (alreadyRefunded) {
        actions.push({ student: studentId, action: "refunded", credits: 1, balanceAfter: Number(assignment.creditBalance || 0) });
        continue;
      }
      const updated: any = await FeeAssignment.findByIdAndUpdate(
        assignment._id,
        { $inc: { creditBalance: 1, totalCreditsConsumed: -1 } },
        { new: true }
      ).lean();
      const balanceAfter = Number(updated?.creditBalance || 0);
      const ledger = await CreditLedger.create({
        student: studentId,
        assignment: assignment._id,
        type: "adjustment",
        credits: 1,
        balanceAfter,
        sourceType: "coach_pay_refund",
        sourceId: classKey,
        performedBy: input.actorId,
        performedByRole: input.actorRole,
        note: input.reason || "Credit returned by no-show ruling",
      }).catch(async (error: any) => {
        // Lost the race to a concurrent save of the same ruling - put the
        // credit back where it was rather than leaving a free one behind.
        await FeeAssignment.findByIdAndUpdate(assignment._id, { $inc: { creditBalance: -1, totalCreditsConsumed: 1 } }).catch(() => null);
        if (error?.code !== 11000) throw error;
        return null;
      });
      actions.push({
        student: studentId,
        action: ledger ? "refunded" : "none",
        credits: ledger ? 1 : 0,
        balanceAfter: ledger ? balanceAfter : Number(assignment.creditBalance || 0),
        ledger: (ledger as any)?._id,
      });
      // `totalCreditsConsumed` is a lifetime counter and must not go negative.
      await FeeAssignment.updateOne({ _id: assignment._id, totalCreditsConsumed: { $lt: 0 } }, { $set: { totalCreditsConsumed: 0 } }).catch(() => null);
      continue;
    }

    actions.push({ student: studentId, action: "none", credits: 0, balanceAfter: Number(assignment.creditBalance || 0) });
  }

  return actions;
}

/**
 * Record an admin's decision about one no-show, and act on it.
 *
 * The two answers are stored and applied independently: paying the coach for a
 * class the student missed does not imply charging the student for it, and the
 * common ruling is exactly that pairing.
 */
export async function saveNoShowRuling(formData: FormData) {
  const session = await requireCoachPayPermission("rule");
  if (!session?.user) throw new Error("Forbidden");
  await dbConnect();

  const classroom = text(formData, "classroom");
  const sessionId = text(formData, "sessionId");
  if (!isValidObjectId(classroom) || !sessionId) throw new Error("Unknown class");

  const payCoach = text(formData, "payCoach") === "yes";
  const deductStudentCredit = text(formData, "deductStudentCredit") === "yes";
  const note = text(formData, "note");
  const coach = text(formData, "coach");
  const actorId = String((session.user as any).id);
  const actorRole = String((session.user as any).role);
  const studentIds = String(formData.get("students") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => isValidObjectId(value));

  const creditActions = await applyCreditDecision({
    classroomId: classroom,
    sessionId,
    studentIds,
    deduct: deductStudentCredit,
    actorId,
    actorRole,
    reason: note,
  });

  const sessionDateRaw = text(formData, "sessionDate");
  const saved = await NoShowRuling.findOneAndUpdate(
    { classroom: new Types.ObjectId(classroom), sessionId },
    {
      classroom: new Types.ObjectId(classroom),
      sessionId,
      sessionDate: sessionDateRaw ? new Date(sessionDateRaw) : undefined,
      coach: isValidObjectId(coach) ? new Types.ObjectId(coach) : undefined,
      sessionStatus: text(formData, "sessionStatus"),
      payCoach,
      deductStudentCredit,
      creditActions,
      note,
      decidedBy: actorId,
      decidedByRole: actorRole === "sub-admin" ? "sub-admin" : "admin",
      decidedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await recordActivity({
    actor: actorId,
    targetUser: isValidObjectId(coach) ? coach : undefined,
    type: "coachPay.noShow.ruled",
    label: `Ruled a no-show: coach ${payCoach ? "paid" : "not paid"}, student credit ${deductStudentCredit ? "deducted" : "not deducted"}`,
    entityType: "NoShowRuling",
    entityId: saved._id.toString(),
    metadata: { classroom, sessionId, payCoach, deductStudentCredit, note, creditActions },
  });

  refresh();
}
