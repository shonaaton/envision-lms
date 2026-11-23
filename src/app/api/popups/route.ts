import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPopupKey, nextLivePopupFor, nextPopupFor, recordPopupAction } from "@/lib/popups/popupService";

export const dynamic = "force-dynamic";

/**
 * The pop-up the signed-in account should see now (counted as seen), or
 * `popup: null`. `?live=1` is the frame's check every few minutes while the
 * portal is open: admin pop-ups only, cheap enough to ask often.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const live = new URL(req.url).searchParams.get("live") === "1";
  try {
    const popup = live ? await nextLivePopupFor(user.id, user.role) : await nextPopupFor(user.id);
    return NextResponse.json({ popup });
  } catch (error) {
    // A pop-up is never worth a broken dashboard.
    console.error("Pop-up lookup failed", error);
    return NextResponse.json({ popup: null });
  }
}

/** `{ key, action: "dismiss" | "click" }` - the student closed it or pressed its button. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!isPopupKey(body?.key) || !["dismiss", "click"].includes(body?.action)) {
    return NextResponse.json({ error: "Invalid pop-up action." }, { status: 400 });
  }
  await recordPopupAction((session.user as any).id, body.key, body.action);
  return NextResponse.json({ ok: true });
}
