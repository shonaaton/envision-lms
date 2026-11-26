import { NextResponse } from "next/server";
import { errorMessage, forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import { createInvites, listInvites } from "@/lib/careers/inviteService";

export const dynamic = "force-dynamic";

/** The invited list (?posting=&status=waiting|invited|opened|applied|cancelled|all&q=). */
export async function GET(req: Request) {
  const actor = await getCareersActor("view");
  if (!actor) return forbidden();
  const params = new URL(req.url).searchParams;
  const result = await listInvites({ posting: params.get("posting") || "", status: params.get("status") || "waiting", q: (params.get("q") || "").trim() });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

/** `{ postingId, text, countryCode }`: invites one person per line of `text`. */
export async function POST(req: Request) {
  const actor = await getCareersActor("edit");
  if (!actor) return forbidden();
  const body = await req.json().catch(() => ({}));
  try {
    const result = await createInvites(String(body?.postingId || ""), String(body?.text || "").slice(0, 60_000), String(body?.countryCode || "+91").slice(0, 8), actor);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not send the invites.") }, { status: 400 });
  }
}
