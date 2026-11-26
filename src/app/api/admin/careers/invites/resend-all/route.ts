import { NextResponse } from "next/server";
import { errorMessage, forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import { resendAllWaiting } from "@/lib/careers/inviteService";

export const dynamic = "force-dynamic";

/** `{ postingId? }`: resends the link to everyone not applied who was last messaged over 24 hours ago. */
export async function POST(req: Request) {
  const actor = await getCareersActor("edit");
  if (!actor) return forbidden();
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await resendAllWaiting(String(body?.postingId || "") || undefined, actor));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not resend the invites.") }, { status: 400 });
  }
}
