import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { dbConnect } from "@/lib/db";
import { validatePopupInput } from "@/lib/popups/popupAdmin";
import { Popup } from "@/models/Popup";

export const dynamic = "force-dynamic";

/** Edit a pop-up, or pause/archive/re-activate it with `{ status }`. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isValidObjectId(params.id)) return NextResponse.json({ error: "Invalid pop-up." }, { status: 400 });
  const session = await requireAdminApiAccess(req, "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const checked = validatePopupInput(body, { partial: true });
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  await dbConnect();
  const popup: any = await Popup.findByIdAndUpdate(params.id, { $set: checked.fields }, { new: true, runValidators: true }).lean();
  if (!popup) return NextResponse.json({ error: "Pop-up not found." }, { status: 404 });
  await recordActivity({
    actor: (session.user as any).id,
    type: "popup.updated",
    label: body.status ? `Set pop-up "${popup.title}" to ${body.status}` : `Edited pop-up "${popup.title}"`,
    entityType: "Popup",
    entityId: params.id,
  });
  return NextResponse.json(popup);
}
