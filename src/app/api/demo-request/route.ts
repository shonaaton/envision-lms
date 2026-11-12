import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { dbConnect } from "@/lib/db";
import { assignDemoLeadOwner } from "@/lib/demoLeadCrm";
import { DEMO_REQUEST_KIND, demoRequestEventId } from "@/lib/demoRequest";
import { announceDemoRequest } from "@/lib/demoRequestLead";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";
import { demoRequestSchema } from "@/lib/validation";
import { issueWhatsAppOtp, maskRecipient } from "@/lib/whatsappOtp";
import { ContactMessage } from "@/models/ContactMessage";

export const dynamic = "force-dynamic";

/**
 * The free demo form's submit. Saves the request, then sends the WhatsApp code.
 *
 * The request is saved before the code goes out, so somebody who never finishes
 * verifying still shows in the inbox, marked unverified. Sales is only tasked
 * once the number is proven, or when the code could not be sent at all.
 */
export async function POST(req: Request) {
  try {
    const limit = consumeRateLimit(`demo-request:ip:${getClientIp(req.headers)}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429, headers: jsonRateLimitHeaders(limit) },
      );
    }

    const data = demoRequestSchema.parse(await req.json());
    // A filled honeypot is a bot. Answer as a success does, so it stops retrying.
    if (data.website) return NextResponse.json({ ok: true, otpSent: false });

    await dbConnect();
    const phone = data.phone.replace(/\D/g, "").replace(/^0+/, "");
    const fields = {
      kind: DEMO_REQUEST_KIND,
      name: data.parentName,
      email: data.email,
      countryCode: data.countryCode,
      phone,
      ageGroup: data.ageGroup,
      childLevel: data.childLevel,
      interest: data.interest,
      preferredTime: data.preferredTime,
      sourcePath: data.sourcePath,
    };
    // One lead per WhatsApp number. A number that already reached sales (verified,
    // or announced because its code could not be sent) is refused, and the try is
    // noted on the lead so the salesperson knows the family came back. A number
    // that never got that far reuses its row, so fixing a detail or coming back
    // later never makes a second lead.
    const sameNumber = { kind: DEMO_REQUEST_KIND, countryCode: data.countryCode, phone };
    const existing: any = await ContactMessage.findOne(sameNumber).sort({ createdAt: -1 }).select("whatsappVerifiedAt announcedAt").lean();
    if (existing && (existing.whatsappVerifiedAt || existing.announcedAt)) {
      await ContactMessage.updateOne(
        { _id: existing._id },
        { $push: { leadLog: { kind: "stage", text: "The family filled the demo form again with this number", byName: "System", at: new Date() } } },
      ).catch(() => undefined);
      return NextResponse.json(
        { error: "We already have a demo request from this WhatsApp number. Our team will call you shortly, so there is no need to fill the form again." },
        { status: 409 },
      );
    }
    const lead: any =
      (existing && (await ContactMessage.findOneAndUpdate({ _id: existing._id, whatsappVerifiedAt: null, announcedAt: null }, { $set: fields }, { new: true }))) ||
      (await ContactMessage.create(fields));
    const id = String(lead._id);
    // Owned from the first save, so a family who never enters the code is still
    // somebody's lead. A fault here must not stop the family's submission.
    await assignDemoLeadOwner(id).catch((error) => console.error("[demo-request] lead not assigned", error));

    const otp = await issueWhatsAppOtp({ reference: id, phone, countryCode: data.countryCode });
    if (otp.status === "throttled") {
      return NextResponse.json(
        { error: `Too many codes were sent to this number. Please try again in ${otp.retryInMinutes} minutes.` },
        { status: 429 },
      );
    }
    if (otp.status === "failed") {
      console.error("[demo-request] WhatsApp code not sent", otp.reason);
      await ContactMessage.updateOne({ _id: id }, { $set: { otpFailedAt: new Date() } });
      void announceDemoRequest(id, req).catch((error) => console.error("[demo-request] announce failed", error));
      return NextResponse.json({ ok: true, id, otpSent: false, metaEventId: demoRequestEventId(id) });
    }

    return NextResponse.json({
      ok: true,
      id,
      otpSent: true,
      sentTo: maskRecipient(otp.recipient, data.countryCode),
      resendInSeconds: otp.resendInSeconds,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Please check the form and try again." }, { status: 400 });
    }
    console.error("[demo-request] submission failed", error);
    return NextResponse.json({ error: "Could not save your details. Please try again." }, { status: 500 });
  }
}
