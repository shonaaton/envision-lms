import "server-only";
import { createHash } from "crypto";

import { dbConnect } from "@/lib/db";
import { EmailDispatch } from "@/models/EmailDispatch";

/**
 * Suppresses an automation email that is a repeat of one just sent.
 *
 * The key deliberately covers the rendered subject and body as well as the
 * recipient and the notification's identity, so it can only ever collapse a
 * message that is genuinely identical. That matters for the cases where a
 * resend is the whole point: a demo re-approved at a new time, an invoice
 * reminder quoting a new balance and a fresh password link all read
 * differently, so all three still go out. What it stops is the same fan-out
 * firing twice because the code path ran twice.
 */

const DEFAULT_WINDOW_MINUTES = 10;

/** Metadata fields that identify *which* notification this is, if not its content. */
const IDENTITY_FIELDS = [
  "notificationDedupKey",
  "dedupKey",
  "kind",
  "event",
  "reason",
  "recipientRole",
  "recipientType",
  "userId",
  "studentId",
  "coachId",
  "bookingId",
  "classroomId",
  "sessionId",
  "batchId",
  "invoiceId",
  "invoiceNumber",
  "homeworkId",
  "tournamentId",
];

export function emailDedupeWindowMs() {
  const configured = Number(process.env.EMAIL_DEDUPE_WINDOW_MINUTES);
  const minutes = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_WINDOW_MINUTES;
  return minutes * 60_000;
}

export function emailDedupeKey(input: { to: string; subject: string; message: string; metadata?: Record<string, unknown> }) {
  const metadata = input.metadata || {};
  const identity = IDENTITY_FIELDS.map((field) => `${field}=${String(metadata[field] ?? "").trim()}`).join("&");
  return createHash("sha1")
    .update([input.to.trim().toLowerCase(), identity, input.subject.trim(), input.message.trim()].join("\u0000"))
    .digest("hex");
}

export type EmailDispatchClaim = { claimed: boolean; key: string };

/**
 * Claims the right to send this email. `claimed: false` means an identical one
 * went out inside the window and this call should stop.
 *
 * Fails open on every error: a dedupe store that is down or misconfigured must
 * never be the reason a notification is lost.
 */
export async function claimEmailDispatch(input: {
  to: string;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<EmailDispatchClaim> {
  const key = emailDedupeKey(input);
  const windowMs = emailDedupeWindowMs();
  if (!windowMs) return { claimed: true, key };
  try {
    await dbConnect();
    const result = await EmailDispatch.updateOne(
      { key },
      {
        // Only on insert: an existing row keeps its original expiry, so a burst
        // of retries cannot slide the window forward indefinitely.
        $setOnInsert: {
          key,
          to: input.to,
          subject: input.subject,
          kind: String(input.metadata?.kind || ""),
          sentAt: new Date(),
          expiresAt: new Date(Date.now() + windowMs),
        },
      },
      { upsert: true }
    );
    return { claimed: Boolean(result.upsertedCount), key };
  } catch (error: any) {
    // A duplicate-key error is the race losing, which is the same answer as a
    // duplicate: somebody else is sending this exact email right now.
    if (error?.code === 11000) return { claimed: false, key };
    console.error("Email dedupe check failed; sending anyway", error);
    return { claimed: true, key };
  }
}
