import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { DEMO_REQUEST_KIND, demoRequestEventId } from "@/lib/demoRequest";
import { announceDemoRequest } from "@/lib/demoRequestLead";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";
import { issueWhatsAppOtp, verifyWhatsAppOtp } from "@/lib/whatsappOtp";
import { ContactMessage } from "@/models/ContactMessage";

export const dynamic = "force-dynamic";

/** Checks a code, or sends a fresh one, for a request the form has already saved. */
export async function POST(req: Request) {
  try {
    const limit = consumeRateLimit(`demo-request-otp:ip:${getClientIp(req.headers)}`, 30, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429, headers: jsonRateLimitHeaders(limit) },
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!isValidObjectId(id)) return NextResponse.json({ error: "Please submit the form again." }, { status: 400 });

    await dbConnect();
    const lead: any = await ContactMessage.findOne({ _id: id, kind: DEMO_REQUEST_KIND }).lean();
    if (!lead) return NextResponse.json({ error: "Please submit the form again." }, { status: 404 });
    // Answers the same on a double tap, without announcing the request twice.
    if (lead.whatsappVerifiedAt) return NextResponse.json({ ok: true, verified: true, metaEventId: demoRequestEventId(id) });

    if (body?.action === "resend") {
      const otp = await issueWhatsAppOtp({ reference: id, phone: lead.phone, countryCode: lead.countryCode });
      if (otp.status === "throttled") {
        return NextResponse.json({ error: `Too many codes were sent to this number. Please try again in ${otp.retryInMinutes} minutes.` }, { status: 429 });
      }
      if (otp.status === "failed") {
        console.error("[demo-request] WhatsApp code not resent", otp.reason);
        await ContactMessage.updateOne({ _id: id }, { $set: { otpFailedAt: new Date() }, $unset: { awaitingCode: 1 } });
        void announceDemoRequest(id, req).catch((error) => console.error("[demo-request] announce failed", error));
        return NextResponse.json({ ok: true, otpSent: false, metaEventId: demoRequestEventId(id) });
      }
      return NextResponse.json({ ok: true, otpSent: true, resendInSeconds: otp.resendInSeconds });
    }

    const result = await verifyWhatsAppOtp({ reference: id, code: String(body?.code || "") });
    if (result.status === "expired") {
      return NextResponse.json({ error: "This code has expired. Please ask for a new one." }, { status: 400 });
    }
    if (result.status === "wrong") {
      const left = result.attemptsLeft === 1 ? "1 try" : `${result.attemptsLeft} tries`;
      return NextResponse.json({ error: `That code is not right. You have ${left} left.` }, { status: 400 });
    }

    // The right code is what submits the form: from here it is a lead.
    await ContactMessage.updateOne({ _id: id }, { $set: { whatsappVerifiedAt: new Date() }, $unset: { awaitingCode: 1 } });
    void announceDemoRequest(id, req).catch((error) => console.error("[demo-request] announce failed", error));
    return NextResponse.json({ ok: true, verified: true, metaEventId: demoRequestEventId(id) });
  } catch (error) {
    console.error("[demo-request] code check failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
