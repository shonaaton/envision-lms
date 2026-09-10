import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { WhatsAppMessage } from "@/models/WhatsApp";

export const dynamic = "force-dynamic";

function cleanEnv(value?: string) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function graphVersion() {
  const value = cleanEnv(process.env.WHATSAPP_GRAPH_VERSION || "v25.0");
  return value.startsWith("v") ? value : `v${value}`;
}

// Media ids only become fetchable once they belong to a stored message, so a signed-in admin
// cannot use this route to pull arbitrary assets out of the business account.
async function findMediaMessage(mediaId: string) {
  return WhatsAppMessage.findOne({
    $or: [
      { mediaId },
      { "rawPayload.image.id": mediaId },
      { "rawPayload.video.id": mediaId },
      { "rawPayload.audio.id": mediaId },
      { "rawPayload.voice.id": mediaId },
      { "rawPayload.document.id": mediaId },
      { "rawPayload.sticker.id": mediaId },
    ],
  })
    .select("mediaId mediaMimeType mediaFilename messageType")
    .lean();
}

export async function GET(_req: Request, { params }: { params: { mediaId: string } }) {
  const session = await auth();
  if (!["admin", "sub-admin"].includes(String((session?.user as any)?.role || ""))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mediaId = String(params.mediaId || "").trim();
  if (!/^\d+$/.test(mediaId)) return NextResponse.json({ error: "Invalid media id" }, { status: 400 });

  await dbConnect();
  const message: any = await findMediaMessage(mediaId);
  if (!message) return NextResponse.json({ error: "Media not found" }, { status: 404 });

  const accessToken = cleanEnv(process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN);
  if (!accessToken) return NextResponse.json({ error: "WHATSAPP_ACCESS_TOKEN is not configured" }, { status: 503 });

  const lookup = await fetch(`https://graph.facebook.com/${graphVersion()}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const lookupPayload = await lookup.json().catch(() => ({}));
  const mediaUrl = String(lookupPayload?.url || "");
  if (!lookup.ok || !mediaUrl) {
    return NextResponse.json(
      { error: "Could not resolve WhatsApp media", detail: lookupPayload?.error?.message || "" },
      { status: 502 }
    );
  }

  // Meta serves the bytes from a lookaside host that still requires the bearer token.
  const download = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!download.ok || !download.body) return NextResponse.json({ error: "Could not download WhatsApp media" }, { status: 502 });

  const contentType = download.headers.get("content-type") || message.mediaMimeType || lookupPayload?.mime_type || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // The bytes behind a media id never change, so cache them in the admin's browser.
    "Cache-Control": "private, max-age=86400, immutable",
  };
  const contentLength = download.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;
  if (message.mediaFilename) headers["Content-Disposition"] = `inline; filename="${message.mediaFilename.replace(/"/g, "")}"`;

  return new Response(download.body, { status: 200, headers });
}
