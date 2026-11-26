import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { LIVE_STAGES, isPostingAcceptingApplications, validateApplication } from "@/lib/careers/careersConfig";
import { announceJobApplication } from "@/lib/careers/careersService";
import { inviteIdForToken } from "@/lib/careers/inviteService";
import { removeResume, saveResume, type StoredResume } from "@/lib/careers/resumeFiles";
import { exactNationalNumber } from "@/lib/phoneCountryCodes";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";
import { issueWhatsAppOtp, maskRecipient } from "@/lib/whatsappOtp";
import { JobApplication, JobPosting } from "@/models/Careers";

export const dynamic = "force-dynamic";

/**
 * "Submit application" on /careers/[slug]. Saves the application with
 * `awaitingCode`, then sends the WhatsApp code: it is listed nowhere until
 * /api/careers/apply/otp checks the code. If the code cannot be sent at all,
 * the application goes through unverified (flagged), as the demo form does.
 *
 * Multipart: `payload` (JSON of the form) and an optional `resume` file.
 */
export async function POST(req: Request) {
  let stored: StoredResume | null = null;
  try {
    const ip = getClientIp(req.headers);
    const limit = consumeRateLimit(`careers-apply:ip:${ip}`, 8, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429, headers: jsonRateLimitHeaders(limit) });
    }

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Please fill in the form and try again." }, { status: 400 });
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(form.get("payload") || "{}"));
    } catch {
      return NextResponse.json({ error: "Please fill in the form and try again." }, { status: 400 });
    }
    // A filled honeypot is a bot. Answer as a success does, so it stops retrying.
    if (payload.website) return NextResponse.json({ ok: true, otpSent: false });

    await dbConnect();
    const posting: any = await JobPosting.findById(String(payload.postingId || "")).lean().catch(() => null);
    if (!posting || !isPostingAcceptingApplications(posting)) {
      return NextResponse.json({ error: "This opening is no longer taking applications." }, { status: 410 });
    }

    const checked = validateApplication(
      { basicFields: posting.basicFields || {}, resume: posting.resume || "optional", questions: posting.questions || [] },
      payload
    );
    if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400 });

    const file = form.get("resume");
    const hasFile = file instanceof File && file.size > 0;
    if (posting.resume === "required" && !hasFile) return NextResponse.json({ error: "Please attach your resume.", field: "resume" }, { status: 400 });

    const countryCode = String(checked.basics.countryCode);
    const phone = exactNationalNumber(checked.basics.phone, countryCode);
    // One live application per WhatsApp number per opening. A row that never got
    // its code is reused, so fixing a detail never makes a second application.
    const existing: any = await JobApplication.findOne({ posting: posting._id, countryCode, phone }).sort({ createdAt: -1 }).select("stage awaitingCode resume").lean();
    if (existing && !existing.awaitingCode && LIVE_STAGES.includes(existing.stage)) {
      return NextResponse.json(
        { error: "You have already applied for this role with this WhatsApp number. Our team will contact you, so there is no need to apply again." },
        { status: 409 }
      );
    }

    if (hasFile && posting.resume !== "off") stored = await saveResume(file as File);

    const invite = await inviteIdForToken(payload.inviteToken, posting._id).catch(() => undefined);
    const fields = {
      ...(invite ? { invite } : {}),
      posting: posting._id,
      postingTitle: posting.title,
      department: posting.department,
      ...checked.basics,
      countryCode,
      phone,
      answers: checked.answers,
      ...(stored ? { resume: stored } : {}),
      awaitingCode: true,
      stage: "new",
      sourcePath: String(payload.sourcePath || "").slice(0, 200),
      ip,
      userAgent: String(req.headers.get("user-agent") || "").slice(0, 300),
    };
    let application: any = null;
    if (existing?.awaitingCode) {
      application = await JobApplication.findOneAndUpdate({ _id: existing._id, awaitingCode: true }, { $set: fields }, { new: true });
      if (application && stored && existing.resume?.storedName) await removeResume(existing.resume.storedName);
    }
    if (!application) application = await JobApplication.create(fields);
    stored = null; // owned by the application now
    const id = String(application._id);

    const otp = await issueWhatsAppOtp({ reference: `career:${id}`, phone, countryCode });
    if (otp.status === "throttled") {
      return NextResponse.json({ error: `Too many codes were sent to this number. Please try again in ${otp.retryInMinutes} minutes.` }, { status: 429 });
    }
    if (otp.status === "failed") {
      console.error("[careers] WhatsApp code not sent", otp.reason);
      await JobApplication.updateOne({ _id: id }, { $set: { otpFailedAt: new Date() }, $unset: { awaitingCode: 1 } });
      void announceJobApplication(id).catch((error) => console.error("[careers] announce failed", error));
      return NextResponse.json({ ok: true, id, otpSent: false });
    }
    return NextResponse.json({ ok: true, id, otpSent: true, sentTo: maskRecipient(otp.recipient, countryCode), resendInSeconds: otp.resendInSeconds });
  } catch (error: any) {
    if (stored) await removeResume(stored.storedName);
    const message = String(error?.message || "");
    if (/resume|PDF|Word/i.test(message)) return NextResponse.json({ error: message, field: "resume" }, { status: 400 });
    console.error("[careers] application failed", error);
    return NextResponse.json({ error: "Could not send your application. Please try again." }, { status: 500 });
  }
}
