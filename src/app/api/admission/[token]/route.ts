import { NextResponse } from "next/server";
import { submitAdmission } from "@/lib/branch/admissions";
import { branchErrorResponse } from "@/lib/branch/http";
import { ADMISSION_MAX_FILE_BYTES, type AdmissionFileKind } from "@/lib/branch/admissionRules";
import { verifyTurnstileToken } from "@/lib/humanVerification";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";

export const dynamic = "force-dynamic";

const FIELDS = ["name", "dateOfBirth", "school", "parentName", "fatherName", "motherName", "phone", "email", "address"];

/**
 * The family's completed admission form. Public: the link's token is the only
 * credential, so this is rate limited per address and checked by Turnstile
 * when the site has it switched on.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const ip = getClientIp(req.headers);
  const limit = consumeRateLimit(`branch-admission:${ip}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many tries. Please wait a while and try again." }, { status: 429, headers: jsonRateLimitHeaders(limit) });
  }
  // Two files under the limit plus the text fields; anything far bigger is not a real form.
  if (Number(req.headers.get("content-length") || 0) > 3 * ADMISSION_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "The files are too large. Each must be under 500 KB." }, { status: 413 });
  }
  try {
    const form = await req.formData();
    const verification = await verifyTurnstileToken(String(form.get("cf-turnstile-response") || ""), ip);
    if (!verification.ok) return NextResponse.json({ error: "Please complete the check that you are not a robot." }, { status: 400 });

    const fields = Object.fromEntries(FIELDS.map((key) => [key, String(form.get(key) ?? "")]));
    const files: { kind: AdmissionFileKind; data: Uint8Array }[] = [];
    for (const kind of ["photo", "idDocument"] as const) {
      const value = form.get(kind);
      if (value && typeof value !== "string" && value.size > 0) {
        if (value.size > ADMISSION_MAX_FILE_BYTES) {
          return NextResponse.json({ error: `Each file must be under 500 KB.` }, { status: 413 });
        }
        files.push({ kind, data: new Uint8Array(await value.arrayBuffer()) });
      }
    }
    return NextResponse.json(await submitAdmission(params.token, fields, files));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
