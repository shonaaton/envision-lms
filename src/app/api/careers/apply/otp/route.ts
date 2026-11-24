import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { announceJobApplication } from "@/lib/careers/careersService";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";
import { issueWhatsAppOtp, verifyWhatsAppOtp } from "@/lib/whatsappOtp";
import { JobApplication } from "@/models/Careers";

export const dynamic = "force-dynamic";

/** Checks the WhatsApp code for a saved application (which submits it), or sends a fresh code. */
export async function POST(req: Request) {
  try {
    const limit = consumeRateLimit(`careers-otp:ip:${getClientIp(req.headers)}`, 30, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429, headers: jsonRateLimitHeaders(limit) });
    }
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!isValidObjectId(id)) return NextResponse.json({ error: "Please submit the form again." }, { status: 400 });

    await dbConnect();
    const application: any = await JobApplication.findById(id).select("phone countryCode whatsappVerifiedAt announcedAt").lean();
    if (!application) return NextResponse.json({ error: "Please submit the form again." }, { status: 404 });
    if (application.whatsappVerifiedAt || application.announcedAt) return NextResponse.json({ ok: true, verified: true });

    const reference = `career:${id}`;
    if (body?.action === "resend") {
      const otp = await issueWhatsAppOtp({ reference, phone: application.phone, countryCode: application.countryCode });
      if (otp.status === "throttled") {
        return NextResponse.json({ error: `Too many codes were sent to this number. Please try again in ${otp.retryInMinutes} minutes.` }, { status: 429 });
      }
      if (otp.status === "failed") {
        console.error("[careers] WhatsApp code not resent", otp.reason);
        await JobApplication.updateOne({ _id: id }, { $set: { otpFailedAt: new Date() }, $unset: { awaitingCode: 1 } });
        void announceJobApplication(id).catch((error) => console.error("[careers] announce failed", error));
        return NextResponse.json({ ok: true, otpSent: false });
      }
      return NextResponse.json({ ok: true, otpSent: true, resendInSeconds: otp.resendInSeconds });
    }

    const result = await verifyWhatsAppOtp({ reference, code: String(body?.code || "") });
    if (result.status === "expired") return NextResponse.json({ error: "This code has expired. Please ask for a new one." }, { status: 400 });
    if (result.status === "wrong") {
      const left = result.attemptsLeft === 1 ? "1 try" : `${result.attemptsLeft} tries`;
      return NextResponse.json({ error: `That code is not right. You have ${left} left.` }, { status: 400 });
    }
    await JobApplication.updateOne({ _id: id }, { $set: { whatsappVerifiedAt: new Date() }, $unset: { awaitingCode: 1 } });
    void announceJobApplication(id).catch((error) => console.error("[careers] announce failed", error));
    return NextResponse.json({ ok: true, verified: true });
  } catch (error) {
    console.error("[careers] code check failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
