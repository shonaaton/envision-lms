import { NextResponse } from "next/server";
import { CERTIFICATE_SIGNATURE_HEADER, verifyCertificateSignature } from "@/lib/exams/examCertificate";
import { examErrorResponse } from "@/lib/exams/examHttp";
import { recordIssuedCertificate } from "@/lib/exams/examService";

export const dynamic = "force-dynamic";

/**
 * n8n posts the finished certificate here: `{ assignmentId, url }`, signed
 * like the request it answers (`x-lms-signature: sha256=<hmac of the body>`
 * with EXAM_CERTIFICATE_WEBHOOK_SECRET). No session: /api/webhooks is public
 * in auth.config.ts, so the signature is the only gate.
 */
export async function POST(req: Request) {
  const secret = String(process.env.EXAM_CERTIFICATE_WEBHOOK_SECRET || "").trim();
  const raw = await req.text();
  if (!verifyCertificateSignature(raw, req.headers.get(CERTIFICATE_SIGNATURE_HEADER), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    const body = JSON.parse(raw || "{}");
    return NextResponse.json(await recordIssuedCertificate(String(body.assignmentId || ""), String(body.url || body.certificateUrl || "").trim()));
  } catch (error) {
    return examErrorResponse(error);
  }
}
