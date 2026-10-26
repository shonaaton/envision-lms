import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPopupKey, nextPopupFor, recordPopupAction } from "@/lib/popups/popupService";

export const dynamic = "force-dynamic";

/** The pop-up the signed-in student should see now (counted as seen), or `popup: null`. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "student") return NextResponse.json({ popup: null });
  try {
    const popup = await nextPopupFor((session.user as any).id);
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
