import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { whatsappSession, canAccessWhatsAppPhone } from "@/lib/whatsappAccess";
import { findMediaMessage, whatsappMediaResponse } from "@/lib/whatsappMediaProxy";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { mediaId: string } }) {
  const user = await whatsappSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mediaId = String(params.mediaId || "").trim();
  if (!/^\d+$/.test(mediaId)) return NextResponse.json({ error: "Invalid media id" }, { status: 400 });

  await dbConnect();
  const message: any = await findMediaMessage(mediaId);
  if (!message) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  if (!(await canAccessWhatsAppPhone(user, message.phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });

  return whatsappMediaResponse(mediaId, message);
}
