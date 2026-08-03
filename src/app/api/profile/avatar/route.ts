import { NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 500 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function detectedImageType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!["student", "instructor", "admin", "sub-admin"].includes(role) || !(await canAccessFeature("accountSettings", session.user as any, "edit"))) {
    return NextResponse.json({ error: "You do not have permission to update the account image." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Use a JPG, PNG, or WEBP image." }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "The selected image is empty." }, { status: 400 });
  if (file.size > MAX_AVATAR_BYTES) return NextResponse.json({ error: "Profile image must be 500 KB or smaller." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedType = detectedImageType(buffer);
  if (!detectedType || detectedType !== file.type) {
    return NextResponse.json({ error: "The selected file is not a valid JPG, PNG, or WEBP image." }, { status: 400 });
  }

  const extension = detectedType === "image/jpeg" ? "jpg" : detectedType === "image/png" ? "png" : "webp";
  const userId = String((session.user as any).id);
  await dbConnect();
  const existing: any = await User.findOne({ _id: userId, role: { $in: ["student", "instructor", "admin", "sub-admin"] } }).select("avatar role").lean();
  if (!existing) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const filename = `avatar-${userId}-${Date.now()}.${extension}`;
  const uploadDirectory = path.join(process.cwd(), "public", "images", "profiles");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, filename), buffer);

  const avatar = `/images/profiles/${filename}`;
  const updated = await User.findOneAndUpdate(
    { _id: userId, role: { $in: ["student", "instructor", "admin", "sub-admin"] } },
    { $set: { avatar } },
    { new: true }
  ).select("_id");
  if (!updated) {
    await unlink(path.join(uploadDirectory, filename)).catch(() => undefined);
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (typeof existing?.avatar === "string" && existing.avatar.startsWith("/images/profiles/")) {
    const previousFilename = path.basename(existing.avatar);
    if (previousFilename === existing.avatar.slice("/images/profiles/".length)) {
      await unlink(path.join(uploadDirectory, previousFilename)).catch(() => undefined);
    }
  }

  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "user.avatar_updated",
    label: "Updated profile image",
    entityType: "User",
    entityId: (session.user as any).id,
  });

  return NextResponse.json({ avatar });
}
