import "server-only";

import { dbConnect } from "@/lib/db";
import { crmStagesForStudents } from "@/lib/crm/leadStage";
import { closeDemoFromCrm, OPEN_DEMO_STATUSES } from "@/lib/crm/sync";
import { Booking } from "@/models/Booking";

/**
 * Closes every open demo whose lead Kraya has already written off.
 *
 * The webhook closes a demo the moment Kraya moves its lead to a closed stage,
 * but only for moves it sees and only for stages counted as closed at that
 * moment. A webhook that failed, or a stage added to CRM_CLOSED_STAGES later,
 * left demos open in the Demo Center while the lead sat in Dead or No Response.
 * This catches them up from the mirrored CRM stage. Closing is the same
 * `closeDemoFromCrm` the webhook runs, so an already-closed demo is untouched.
 */
export async function reconcileDemoStagesFromCrm() {
  await dbConnect();
  const bookings: any[] = await Booking.find({ bookingType: "demo", demoStatus: { $in: OPEN_DEMO_STATUSES }, archivedAt: null })
    .select("student")
    .populate("student", "phone email")
    .lean();
  const students = bookings.map((booking) => booking.student).filter((student) => student?._id);
  const stages = await crmStagesForStudents(students);

  let closed = 0;
  const done = new Set<string>();
  for (const student of students) {
    const studentId = String(student._id);
    const crm = stages.get(studentId);
    if (!crm?.closed || done.has(studentId)) continue;
    done.add(studentId);
    const result = await closeDemoFromCrm({ userId: studentId, stageName: crm.stage }).catch((error) => {
      console.error("[crm] could not close demo from CRM stage", studentId, error);
      return { closed: 0 };
    });
    closed += Number(result.closed || 0);
  }
  return { scanned: students.length, closed };
}

/** Scheduler entry. With no mirrored CRM leads there is simply nothing to close. */
export async function processCrmDemoStageReconcile() {
  const result = await reconcileDemoStagesFromCrm();
  if (result.closed) console.info(`[crm] closed ${result.closed} demo(s) whose lead is closed in the CRM`);
}
