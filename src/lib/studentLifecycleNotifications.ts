import { formatAcademyDateTime } from "@/lib/academyTime";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { messageFamily, whatsappRecipientName } from "@/lib/familyMessaging";
import { importantContactWhatsAppRecipientsByKeys, importantContactsByRole } from "@/lib/importantContacts";
import { sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";
import { StudentPause } from "@/models/StudentPause";
import { User } from "@/models/User";

/**
 * Notifications for changes in a student's standing.
 *
 * Pausing, resuming, leaving, and having credits reversed all changed the
 * account silently. A silent balance change or a silent pause is what generates
 * the support message asking what happened.
 */

/** How many days before a pause ends the family is reminded. */
const PAUSE_EXPIRY_NOTICE_DAYS = 7;

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function dayLabel(value: any) {
  return formatAcademyDateTime(new Date(value), { hour: undefined, minute: undefined });
}

async function loadStudent(studentInput: any) {
  if (studentInput?.email || studentInput?.parentEmail) return studentInput;
  return User.findById(objectId(studentInput)).select("name username email phone countryCode parentName parentEmail").lean();
}

/* ------------------------------------------------------------------ */
/* Pause lifecycle                                                     */
/* ------------------------------------------------------------------ */

export async function notifyPauseStarted(pause: any, studentInput?: any) {
  const student: any = await loadStudent(studentInput || pause?.student);
  if (!student) return { sent: 0 };
  const until = dayLabel(pause.pausedUntil);
  const restart = pause.expectedRestartDate ? dayLabel(pause.expectedRestartDate) : until;
  const body = [
    `Your classes are paused from ${dayLabel(pause.pausedFrom)} until ${until}.`,
    pause.batchName ? `Batch: ${pause.batchName}` : "",
    "",
    `Billing is paused for this period and classes are expected to restart on ${restart}.`,
    "Nothing else is needed from you — we will be in touch before the restart.",
  ].filter((line) => line !== "").join("\n");

  return messageFamily({
    student,
    subject: "Your classes are paused",
    message: `Hello ${student.name || "there"},\n\n${body}`,
    parentMessage: `Hello ${student.parentName || "Parent"},\n\n${body}`,
    templateName: "student_pause_started",
    bodyParameters: [whatsappRecipientName(student), dayLabel(pause.pausedFrom), until],
    metadata: { kind: "student_pause_started", studentId: objectId(student._id), pauseId: objectId(pause._id), href: "/dashboard" },
  });
}

export async function notifyStudentResumed(pause: any, studentInput?: any, restartDate?: any) {
  const student: any = await loadStudent(studentInput || pause?.student);
  if (!student) return { sent: 0 };
  const restart = dayLabel(restartDate || pause?.expectedRestartDate || new Date());
  const body = [
    `Welcome back — classes restart on ${restart}.`,
    pause?.batchName ? `Batch: ${pause.batchName}` : "",
    "",
    "Your schedule is back on the dashboard and billing resumes from the next invoice date.",
  ].filter((line) => line !== "").join("\n");

  return messageFamily({
    student,
    subject: "Your classes are starting again",
    message: `Hello ${student.name || "there"},\n\n${body}`,
    parentMessage: `Hello ${student.parentName || "Parent"},\n\n${body}`,
    templateName: "student_resumed",
    bodyParameters: [whatsappRecipientName(student), restart],
    metadata: { kind: "student_resumed", studentId: objectId(student._id), pauseId: objectId(pause?._id), href: "/dashboard" },
  });
}

/**
 * Nightly sweep for pauses about to end, so a family is not surprised by
 * classes and billing restarting. Marked on the pause record so it sends once,
 * not every night of the final week.
 */
export async function processDuePauseExpiryNotices(now = new Date()) {
  await dbConnect();
  const horizon = new Date(now.getTime() + PAUSE_EXPIRY_NOTICE_DAYS * 86_400_000);
  const pauses: any[] = await StudentPause.find({
    status: "active",
    pausedUntil: { $gte: now, $lte: horizon },
    expiryNoticeSentAt: { $exists: false },
  })
    .limit(200)
    .lean();

  let sent = 0;
  for (const pause of pauses) {
    // Claim first: two instances sweeping the same night must not both send.
    const claimed = await StudentPause.findOneAndUpdate(
      { _id: pause._id, expiryNoticeSentAt: { $exists: false } },
      { $set: { expiryNoticeSentAt: new Date() } },
      { new: true, projection: { _id: 1 } },
    ).lean();
    if (!claimed) continue;

    const student: any = await loadStudent(pause.student);
    if (!student) continue;
    const restart = dayLabel(pause.expectedRestartDate || pause.pausedUntil);
    const body = [
      `Your break ends on ${dayLabel(pause.pausedUntil)} and classes are due to restart on ${restart}.`,
      pause.batchName ? `Batch: ${pause.batchName}` : "",
      "",
      "Billing restarts along with the classes. If you need longer, reply and let us know before the restart date.",
    ].filter((line) => line !== "").join("\n");

    await messageFamily({
      student,
      subject: "Your break ends soon",
      message: `Hello ${student.name || "there"},\n\n${body}`,
      parentMessage: `Hello ${student.parentName || "Parent"},\n\n${body}`,
      templateName: "student_pause_ending",
      bodyParameters: [whatsappRecipientName(student), dayLabel(pause.pausedUntil), restart],
      metadata: { kind: "student_pause_ending", studentId: objectId(student._id), pauseId: objectId(pause._id), href: "/dashboard" },
    });
    sent += 1;
  }

  return { checked: pauses.length, sent };
}

/* ------------------------------------------------------------------ */
/* Credit reversal                                                     */
/* ------------------------------------------------------------------ */

/**
 * Tells a family when class credits are taken back off the balance, and why.
 * A balance that changes without explanation is the most common reason a
 * parent messages the academy.
 */
export async function notifyCreditReversal(input: {
  student: any;
  reversedCredits: number;
  balanceAfter: number;
  reason?: string;
  invoiceNumber?: string;
}) {
  const student: any = await loadStudent(input.student);
  if (!student) return { sent: 0 };
  const credits = Math.abs(Number(input.reversedCredits || 0));
  if (!credits) return { sent: 0 };

  const body = [
    `${credits} class credit${credits === 1 ? "" : "s"} have been removed from your balance.`,
    input.invoiceNumber ? `Related invoice: ${input.invoiceNumber}` : "",
    input.reason ? `Reason: ${input.reason}` : "",
    "",
    `Remaining balance: ${Math.max(0, Number(input.balanceAfter || 0))} credit${Number(input.balanceAfter) === 1 ? "" : "s"}.`,
    "",
    "If this looks wrong, reply to this message and we will check it.",
  ].filter((line) => line !== "").join("\n");

  return messageFamily({
    student,
    subject: "Class credits adjusted",
    message: `Hello ${student.name || "there"},\n\n${body}`,
    parentMessage: `Hello ${student.parentName || "Parent"},\n\n${body}`,
    templateName: "class_credits_reversed",
    bodyParameters: [whatsappRecipientName(student), String(credits), String(Math.max(0, Number(input.balanceAfter || 0)))],
    metadata: {
      kind: "credit_reversal",
      studentId: objectId(student._id),
      reversedCredits: credits,
      invoiceNumber: input.invoiceNumber || "",
      href: "/fees",
    },
  });
}

/* ------------------------------------------------------------------ */
/* Batch vacancy                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tells the sales team a seat has opened. Time critical and, until now,
 * invisible — a vacancy was only discovered by opening the vacancy report.
 */
export async function notifyBatchVacancy(input: { batch: any; seatsOpen: number; reason?: string }) {
  const batchName = String(input.batch?.name || "a batch").trim();
  const seats = Math.max(1, Number(input.seatsOpen || 1));
  const staff = importantContactsByRole("sales").concat(importantContactsByRole("admin"));
  if (!staff.length) return { alerted: 0 };

  const metadata = { kind: "batch_vacancy", batchId: objectId(input.batch?._id), seatsOpen: seats, href: "/sales" };
  const message = [
    `${seats} seat${seats === 1 ? "" : "s"} opened in ${batchName}.`,
    input.reason ? `Reason: ${input.reason}` : "",
    "",
    "Check the waiting list before the slot is offered elsewhere.",
  ].filter((line) => line !== "").join("\n");

  await Promise.all(
    Array.from(new Set(staff.map((contact) => contact.email).filter(Boolean))).map((email) =>
      sendAutomationEmail({ to: String(email), subject: `Seat open in ${batchName}`, message, metadata }).catch(() => null),
    ),
  );

  const keys = Array.from(new Set(staff.map((contact) => contact.key).filter(Boolean)));
  if (keys.length) {
    await sendWhatsAppAutomationTemplates(
      importantContactWhatsAppRecipientsByKeys(keys).map((recipient) => ({
        user: recipient,
        templateName: "batch_vacancy_sales_alert",
        bodyParameters: [recipient.name || "Team", batchName, String(seats)],
        metadata: { ...metadata, dedupKey: `batch_vacancy:${objectId(input.batch?._id)}:${seats}` },
      })),
    );
  }

  return { alerted: staff.length };
}
