import { dbConnect } from "@/lib/db";
import { messageFamily, whatsappRecipientName } from "@/lib/familyMessaging";
import { Invoice } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Google review requests.
 *
 * `googleReviews.ts` only ever pulled reviews in; nothing asked for one. This
 * asks, at the two moments the academy chose: when a student finishes a level,
 * and when a student leaves.
 */

export const GOOGLE_REVIEW_URL =
  process.env.GOOGLE_REVIEW_URL ||
  "https://search.google.com/local/writereview?placeid=ChIJCyzcAPt3AjoRok7LxzV7m04";

/** A review is a favour to ask. One ask per family per year, whatever triggers it. */
const REVIEW_REQUEST_COOLDOWN_DAYS = 365;

export type ReviewTrigger = "level_complete" | "student_left";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/**
 * Whether this family should be asked at all.
 *
 * Two gates. The cooldown stops the same family being asked twice. The unpaid
 * check stops the academy asking for a public review from someone it is
 * currently chasing for money — the one situation where the ask reliably
 * backfires.
 */
async function canRequestReview(student: any) {
  if (!student?.email && !student?.phone) return { ok: false, reason: "no_contact" as const };

  const lastAsked = student.reviewRequestedAt ? new Date(student.reviewRequestedAt) : null;
  if (lastAsked && Date.now() - lastAsked.getTime() < REVIEW_REQUEST_COOLDOWN_DAYS * 86_400_000) {
    return { ok: false, reason: "cooldown" as const };
  }

  const unpaid = await Invoice.exists({
    student: objectId(student._id),
    status: { $in: ["unpaid", "overdue"] },
  });
  if (unpaid) return { ok: false, reason: "unpaid_invoice" as const };

  return { ok: true, reason: null };
}

function reviewCopy(trigger: ReviewTrigger, studentName: string, context?: string) {
  if (trigger === "level_complete") {
    return {
      subject: `Congratulations on finishing ${context || "your level"}`,
      lines: [
        `${studentName} has finished ${context || "a level"} — a real milestone, and well earned.`,
        "",
        "If the coaching has been good, would you take a minute to say so on Google? It genuinely helps other parents choosing an academy.",
      ],
    };
  }
  return {
    subject: "Thank you for your time with us",
    lines: [
      `${studentName}'s classes with Envision Chess Academy have now ended. Thank you for the time you spent with us.`,
      "",
      "If the coaching served you well, a short review on Google would help other parents deciding where to start.",
    ],
  };
}

/**
 * Asks one family for a Google review. Records the ask before sending, so a
 * retry or a double trigger cannot ask twice.
 */
export async function requestGoogleReview(input: {
  student: any;
  trigger: ReviewTrigger;
  /** Level or course name, used in the level-complete wording. */
  context?: string;
}) {
  await dbConnect();
  const student: any = input.student?.email || input.student?.parentEmail
    ? input.student
    : await User.findById(objectId(input.student))
        .select("name username email phone countryCode parentName parentEmail reviewRequestedAt")
        .lean();
  if (!student) return { sent: 0, skipped: "student_not_found" as const };

  const eligible = await canRequestReview(student);
  if (!eligible.ok) return { sent: 0, skipped: eligible.reason };

  // Claim before sending.
  const claimed = await User.findOneAndUpdate(
    {
      _id: student._id,
      $or: [
        { reviewRequestedAt: { $exists: false } },
        { reviewRequestedAt: { $lte: new Date(Date.now() - REVIEW_REQUEST_COOLDOWN_DAYS * 86_400_000) } },
      ],
    },
    { $set: { reviewRequestedAt: new Date() } },
    { new: true, projection: { _id: 1 } },
  ).lean();
  if (!claimed) return { sent: 0, skipped: "cooldown" as const };

  const studentName = String(student.name || student.username || "your child");
  const copy = reviewCopy(input.trigger, studentName, input.context);
  const body = [...copy.lines, "", `Leave a review: ${GOOGLE_REVIEW_URL}`].join("\n");

  const result = await messageFamily({
    student,
    subject: copy.subject,
    message: `Hello ${studentName},\n\n${body}`,
    parentMessage: `Hello ${student.parentName || "Parent"},\n\n${body}`,
    templateName: input.trigger === "level_complete" ? "review_request_level_complete" : "review_request_farewell",
    bodyParameters: [whatsappRecipientName(student), studentName, input.context || ""].filter(Boolean),
    metadata: {
      kind: "google_review_request",
      trigger: input.trigger,
      studentId: objectId(student._id),
      actionUrl: GOOGLE_REVIEW_URL,
      actionLabel: "Leave a Google review",
    },
  });

  return { sent: result.emailsSent + Number(result.whatsappDelivered), skipped: null };
}
