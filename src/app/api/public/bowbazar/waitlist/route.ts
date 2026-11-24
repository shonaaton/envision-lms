import { NextResponse } from "next/server";
import { BranchError } from "@/lib/branch/errors";
import { joinWaitlistFromWebsite } from "@/lib/branch/leads";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";

export const dynamic = "force-dynamic";

/**
 * The Bowbazar centre page's "join the waitlist" form. Public, so it is rate
 * limited per address and carries a honeypot like the contact form.
 * `{ slotId, childName, parentName, phone, email, note?, website? }`
 */
export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const limit = consumeRateLimit(`bowbazar-waitlist:ip:${ip}`, 8, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "You have sent several requests already. Please wait a little and try again." }, { status: 429, headers: jsonRateLimitHeaders(limit) });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.website) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: true, ...(await joinWaitlistFromWebsite("bowbazar", body)) });
  } catch (error) {
    if (error instanceof BranchError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[bowbazar waitlist] join failed", error);
    return NextResponse.json({ error: "Could not add you to the waitlist. Please try again." }, { status: 500 });
  }
}
