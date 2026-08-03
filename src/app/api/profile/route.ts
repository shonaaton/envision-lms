import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";

const profileSchema = z
  .object({
    city: z.string().trim().max(80, "City must be 80 characters or fewer."),
    country: z.string().trim().max(80, "Country must be 80 characters or fewer."),
    gender: z.enum(["male", "female", "other", "not_available"]),
    fideId: z
      .string()
      .trim()
      .max(20, "FIDE ID must be 20 characters or fewer.")
      .refine((value) => !value || /^\d+$/.test(value), "FIDE ID can contain numbers only."),
    avatar: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid profile colour.").optional(),
  })
  .strict("Only editable profile fields can be updated here.");

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (role !== "student" && role !== "instructor") {
    return NextResponse.json({ error: "Profile editing is available to students and coaches." }, { status: 403 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check your profile details." }, { status: 400 });
  }

  await dbConnect();
  const profileFilter = { _id: (session.user as any).id, role: { $in: ["student", "instructor"] } };
  const previous: any = parsed.data.avatar ? await User.findOne(profileFilter).select("avatar").lean() : null;
  const updated: any = await User.findOneAndUpdate(
    profileFilter,
    { $set: parsed.data },
    { new: true, runValidators: true }
  )
    .select("city country gender fideId avatar")
    .lean();

  if (!updated) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  if (parsed.data.avatar && typeof previous?.avatar === "string" && previous.avatar.startsWith("/images/profiles/")) {
    const filename = path.basename(previous.avatar);
    if (filename === previous.avatar.slice("/images/profiles/".length)) {
      await unlink(path.join(process.cwd(), "public", "images", "profiles", filename)).catch(() => undefined);
    }
  }

  return NextResponse.json({
    profile: {
      city: updated.city || "",
      country: updated.country || "",
      gender: updated.gender || "not_available",
      fideId: updated.fideId || "",
      avatar: updated.avatar || "",
    },
  });
}
