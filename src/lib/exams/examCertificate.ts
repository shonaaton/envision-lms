import { formatAcademyDateTime } from "@/lib/academyTime";
import { examLevelLabel, scorePercent } from "@/lib/exams/examRules";

/**
 * The certificate hand-off to n8n. The LMS posts the result, signed with
 * EXAM_CERTIFICATE_WEBHOOK_SECRET; n8n renders the certificate and posts its
 * link back to /api/webhooks/exam-certificate with the same signature.
 *
 * Reached from instrumentation.ts (the sweep retries failed sends), which is
 * also compiled for Edge: crypto must be loaded at run time, never imported.
 */

export const CERTIFICATE_SIGNATURE_HEADER = "x-lms-signature";
export const CERTIFICATE_MAX_ATTEMPTS = 5;

function nodeCrypto(): typeof import("crypto") {
  // eslint-disable-next-line no-eval
  return eval("require")("crypto");
}

export function signCertificateBody(body: string, secret: string) {
  return `sha256=${nodeCrypto().createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyCertificateSignature(body: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = Buffer.from(signCertificateBody(body, secret));
  const given = Buffer.from(signature.trim());
  return expected.length === given.length && nodeCrypto().timingSafeEqual(expected, given);
}

/** Retry after 5, 15, 45, 135 minutes. */
export function nextCertificateAttemptAt(attempts: number, now = new Date()) {
  return new Date(now.getTime() + 5 * 60_000 * 3 ** Math.max(0, attempts - 1));
}

export function certificateNumberFor(assignment: { _id: unknown; tier: string; levelNumber: number; submittedAt?: Date }) {
  const tierCode = String(assignment.tier || "").slice(0, 1).toUpperCase() || "X";
  const year = (assignment.submittedAt || new Date()).getUTCFullYear();
  return `ECA-${tierCode}${assignment.levelNumber}-${year}-${String(assignment._id).slice(-8).toUpperCase()}`;
}

export function certificatePayload(assignment: any, student: any, callbackUrl: string) {
  const score = assignment.score || {};
  return {
    event: "exam.completed",
    assignmentId: String(assignment._id),
    certificateNumber: assignment.certificateNumber,
    student: {
      id: String(student?._id || assignment.student),
      name: student?.name || "",
      username: student?.username || "",
      email: student?.email || "",
      parentName: student?.parentName || "",
      parentEmail: student?.parentEmail || "",
      phone: student?.phone ? `${student.countryCode || ""}${student.phone}` : "",
    },
    exam: {
      tier: assignment.tier,
      levelNumber: assignment.levelNumber,
      levelLabel: examLevelLabel(assignment.tier, assignment.levelNumber),
    },
    score: {
      mcq: score.mcq ?? 0,
      mcqMax: 20,
      positions: score.positions ?? 0,
      positionsMax: 80,
      total: score.total ?? 0,
      max: score.max ?? 100,
      percent: score.percent ?? scorePercent(score.total ?? 0, score.max ?? 100),
    },
    submitReason: assignment.submitReason,
    completedAt: assignment.submittedAt ? new Date(assignment.submittedAt).toISOString() : null,
    completedOnIst: assignment.submittedAt ? formatAcademyDateTime(assignment.submittedAt, { day: "numeric", month: "long", year: "numeric" }) : "",
    callbackUrl,
  };
}

export async function postCertificateWebhook(payload: unknown) {
  const url = String(process.env.EXAM_CERTIFICATE_WEBHOOK_URL || "").trim();
  const secret = String(process.env.EXAM_CERTIFICATE_WEBHOOK_SECRET || "").trim();
  if (!url) return { ok: false, error: "EXAM_CERTIFICATE_WEBHOOK_URL is not set" };
  if (!secret) return { ok: false, error: "EXAM_CERTIFICATE_WEBHOOK_SECRET is not set" };
  const body = JSON.stringify(payload);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", [CERTIFICATE_SIGNATURE_HEADER]: signCertificateBody(body, secret) },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { ok: false, error: `Webhook answered ${response.status}` };
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
