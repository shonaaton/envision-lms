import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { dbConnect } from "@/lib/db";
import { audienceQuery, engagementOverview, listPopups, popupTargets, validatePopupInput } from "@/lib/popups/popupAdmin";
import { forgetCachedCampaigns } from "@/lib/popups/popupService";
import { Popup } from "@/models/Popup";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

/** `?view=engagement` for the weekly WhatsApp overview; otherwise pop-ups and the audience pick lists. */
export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  if (new URL(req.url).searchParams.get("view") === "engagement") {
    return NextResponse.json(await engagementOverview());
  }
  const [popups, targets] = await Promise.all([listPopups(), popupTargets()]);
  return NextResponse.json({ popups, targets });
}

export async function POST(req: Request) {
  const session = await requireAdminApiAccess(req, "create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const checked = validatePopupInput({ ...body, status: body?.status || "active" });
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  await dbConnect();
  const actor = session.user as any;
  const popup = await Popup.create({ ...checked.fields, createdBy: actor.id, createdByName: actor.name || "" });
  forgetCachedCampaigns();
  await recordActivity({
    actor: actor.id,
    type: "popup.created",
    label: `Created pop-up "${popup.title}"`,
    entityType: "Popup",
    entityId: String(popup._id),
  });
  const query = await audienceQuery(popup);
  const audience = query ? await User.countDocuments(query) : 0;
  return NextResponse.json({ ...popup.toObject(), stats: { audience, seen: 0, clicked: 0, dismissed: 0 } }, { status: 201 });
}
