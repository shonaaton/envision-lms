import path from "path";
import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { extensionForImageType, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * The stored name keeps a readable stem of the original, but its extension
 * comes from the checked image type, never from what the file was called.
 */
function safeName(name: string, extension: string) {
  const base = path.parse(name).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "achievement";
  return `${base}-${Date.now()}${extension}`;
}

export async function POST(req: Request) {
  const session = await requireAdminApiAccess(req, "create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Please choose an image file." }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WEBP, and GIF images are supported." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 8 MB." }, { status: 400 });

  const filename = safeName(file.name, extensionForImageType(file.type) || ".jpg");
  // Stored outside public/ and served from /uploads (see lib/uploads.ts).
  const imageUrl = await saveUpload("achievements", filename, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({
    imageUrl,
    sourceImageName: filename,
  });
}
