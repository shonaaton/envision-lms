import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { DEMO_REQUEST_KIND } from "@/lib/demoRequest";
import { demoSlotLabel, demoSlotStart, isOpenDemoSlot } from "@/lib/demoRequestSlots";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";
import { refreshDemoRequestTask } from "@/lib/tasks/taskTriggers";
import { ContactMessage } from "@/models/ContactMessage";

export const dynamic = "force-dynamic";

/**
 * Saves the demo slot a family picks on the thank-you page.
 *
 * Only a request that finished the form's last step can carry one: verified, or
 * let through because the code could not be sent. Picking again replaces the
 * earlier choice, so a parent who changes their mind is not stuck.
 */
export async function POST(req: Request) {
  try {
    const limit = consumeRateLimit(`demo-request-slot:ip:${getClientIp(req.headers)}`, 20, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429, headers: jsonRateLimitHeaders(limit) },
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    const date = String(body?.date || "");
    const time = String(body?.time || "");
    if (!isValidObjectId(id)) return NextResponse.json({ error: "Please submit the form again." }, { status: 400 });
    if (!isOpenDemoSlot(date, time)) {
      return NextResponse.json({ error: "That slot is not available. Please choose another." }, { status: 400 });
    }

    await dbConnect();
    const lead: any = await ContactMessage.findOneAndUpdate(
      { _id: id, kind: DEMO_REQUEST_KIND, $or: [{ whatsappVerifiedAt: { $ne: null } }, { otpFailedAt: { $ne: null } }] },
      { $set: { demoSlotDate: date, demoSlotTime: time, demoSlotAt: demoSlotStart(date, time) } },
      { new: true },
    ).lean();
    if (!lead) return NextResponse.json({ error: "Please submit the form again." }, { status: 404 });

    await refreshDemoRequestTask(lead);
    return NextResponse.json({ ok: true, date, time, label: demoSlotLabel(date, time) });
  } catch (error) {
    console.error("[demo-request] slot not saved", error);
    return NextResponse.json({ error: "Could not save your slot. Please try again." }, { status: 500 });
  }
}
