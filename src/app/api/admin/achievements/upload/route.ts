import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function safeName(name: string) {
  const parsed = path.parse(name);
  const base = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "achievement";
  const ext = parsed.ext.toLowerCase() || ".jpg";
  return `${base}-${Date.now()}${ext}`;
}

export async function POST(req: Request) {
  const session = await requireAdminApiAccess(req, "create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Please choose an image file." }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WEBP, and GIF images are supported." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 8 MB." }, { status: 400 });

  const filename = safeName(file.name);
  const uploadDir = path.join(process.cwd(), "public", "images", "achievements", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({
    imageUrl: `/images/achievements/uploads/${filename}`,
    sourceImageName: filename,
  });
}
