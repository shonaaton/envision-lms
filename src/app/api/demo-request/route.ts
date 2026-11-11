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
      countryCode: data.countryCode,
      phone,
      ageGroup: data.ageGroup,
      childLevel: data.childLevel,
      interest: data.interest,
      preferredTime: data.preferredTime,
      sourcePath: data.sourcePath,
    };
    // Going back to fix a detail updates the same row. A verified request is left
    // alone, so a second child on one number stays a second request.
    const lead: any =
      (await ContactMessage.findOneAndUpdate(
        {
          kind: DEMO_REQUEST_KIND,
          countryCode: data.countryCode,
          phone,
          status: "new",
          whatsappVerifiedAt: null,
          announcedAt: null,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        { $set: fields },
        { new: true, sort: { createdAt: -1 } },
      )) || (await ContactMessage.create(fields));
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
