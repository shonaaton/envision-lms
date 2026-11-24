import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { forbidden, requireBranchAccess } from "@/lib/branch/http";
import { isBranchFamilyNumber } from "@/lib/branch/whatsapp";
import { findMediaMessage, whatsappMediaResponse } from "@/lib/whatsappMediaProxy";

export const dynamic = "force-dynamic";

/** A photo, voice note or document from a Bowbazar family's chat; only this centre's families. */
export async function GET(_req: Request, { params }: { params: { mediaId: string } }) {
  const access = await requireBranchAccess("whatsapp");
  if (!access) return forbidden();
  const mediaId = String(params.mediaId || "").trim();
  if (!/^\d+$/.test(mediaId)) return NextResponse.json({ error: "Invalid media id" }, { status: 400 });
  await dbConnect();
  const message: any = await findMediaMessage(mediaId);
  if (!message || !(await isBranchFamilyNumber(access.branch, message.phoneNumber))) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  return whatsappMediaResponse(mediaId, message);
}
