import "server-only";

import { Types } from "mongoose";

import { recordActivity } from "@/lib/activity";
import { raisePayProposalTask } from "@/lib/tasks/taskTriggers";
import { CoachPayProposal, type PayKind, type RateUnit } from "@/models/CoachPay";

/**
 * Writing a coach's pay proposals.
 *
 * Shared by the Coach Pay screens and the monthly staff invoice, which submits
 * whatever rates a coach typed for classes that had none. Every function here
 * only ever creates or edits a *pending* proposal: nothing is paid until an
 * admin approves it in Coach Submissions.
 *
 * Callers are responsible for having checked that the coach is entitled to
 * propose for the target (teaches the classroom, took the class).
 */

type RateValue = { amount: number | null; unit: RateUnit };

async function afterSubmit(saved: any, coachId: string, label: string, metadata: Record<string, unknown>) {
  await recordActivity({
    actor: coachId,
    targetUser: coachId,
    type: "coachPay.proposal.submitted",
    label,
    entityType: "CoachPayProposal",
    entityId: saved._id.toString(),
    metadata,
  });
  await raisePayProposalTask({ proposal: saved });
}

/** A coach-wide demo rate, for every demo class they teach. */
export async function upsertCoachDemoRateProposal(input: { coachId: string; demo: RateValue; note?: string }) {
  const coach = new Types.ObjectId(input.coachId);
  const saved = await CoachPayProposal.findOneAndUpdate(
    { coach, kind: "coach_rate", status: "pending" },
    {
      $set: {
        demo: input.demo,
        note: input.note || "",
        submittedBy: coach,
        submittedAt: new Date(),
      },
      $setOnInsert: { kind: "coach_rate", coach, status: "pending" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await afterSubmit(saved, input.coachId, "Proposed a rate for their demo classes", { demo: input.demo });
  return saved;
}

/**
 * One kind of a classroom's standing rate. `$set` of that kind only, so a
 * pending proposal the coach already made for the other kinds survives.
 */
export async function upsertClassroomRateKindProposal(input: {
  coachId: string;
  classroomId: string;
  kind: PayKind;
  value: RateValue;
  note?: string;
}) {
  const coach = new Types.ObjectId(input.coachId);
  const classroom = new Types.ObjectId(input.classroomId);
  const saved = await CoachPayProposal.findOneAndUpdate(
    { coach, classroom, kind: "classroom_rate", status: "pending" },
    {
      $set: {
        [input.kind]: input.value,
        note: input.note || "",
        submittedBy: coach,
        submittedAt: new Date(),
      },
      $setOnInsert: { kind: "classroom_rate", coach, classroom, status: "pending" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await afterSubmit(saved, input.coachId, "Proposed rates for a classroom they teach", {
    classroom: input.classroomId,
    [input.kind]: input.value,
  });
  return saved;
}

/** The price of one class the coach took. */
export async function upsertSessionProposal(input: {
  coachId: string;
  classroomId: string;
  sessionId: string;
  sessionDate?: Date;
  payKind: PayKind;
  amount: number;
  unit?: RateUnit;
  note?: string;
}) {
  const coach = new Types.ObjectId(input.coachId);
  const classroom = new Types.ObjectId(input.classroomId);
  const saved = await CoachPayProposal.findOneAndUpdate(
    { coach, classroom, sessionId: input.sessionId, kind: "session", status: "pending" },
    {
      $set: {
        sessionDate: input.sessionDate,
        payKind: input.payKind,
        amount: input.amount,
        unit: input.unit || "per_class",
        note: input.note || "",
        submittedBy: coach,
        submittedAt: new Date(),
      },
      $setOnInsert: { kind: "session", coach, classroom, sessionId: input.sessionId, status: "pending" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await afterSubmit(saved, input.coachId, `Proposed ${(input.amount / 100).toFixed(2)} for a class they took`, {
    classroom: input.classroomId,
    sessionId: input.sessionId,
    amount: input.amount,
  });
  return saved;
}
