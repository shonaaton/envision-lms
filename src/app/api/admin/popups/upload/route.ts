import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { extensionForImageType, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * An image for a pop-up, chosen from the admin's computer instead of pasted as
 * a link. Stored like the other uploads (lib/uploads.ts) and served from
 * /uploads/popups/<file>. The extension comes from the checked type, never
 * from what the file was called.
 */
export async function POST(req: Request) {
  const session = await requireAdminApiAccess(req, "create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  const extension = extensionForImageType(file.type);
  if (!extension) return NextResponse.json({ error: "Use a JPG, PNG, WEBP or GIF image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep the image under 5 MB." }, { status: 400 });
  const filename = `popup-${Date.now()}-${randomBytes(4).toString("hex")}${extension}`;
  const imageUrl = await saveUpload("popups", filename, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ imageUrl });
}
