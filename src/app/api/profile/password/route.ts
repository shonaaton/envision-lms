import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(128),
    newPassword: z.string().min(8, "New password must be at least 8 characters.").max(72, "New password must be 72 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, { message: "New passwords do not match.", path: ["confirmPassword"] })
  .refine((value) => value.currentPassword !== value.newPassword, { message: "Choose a new password that is different from your current password.", path: ["newPassword"] });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!["student", "instructor", "admin", "sub-admin"].includes(role) || !(await canAccessFeature("accountSettings", session.user as any, "security"))) {
    return NextResponse.json({ error: "You do not have permission to change this account password." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the password fields." }, { status: 400 });
  }

  await dbConnect();
  const user = await User.findById((session.user as any).id).select("passwordHash name role");
  if (!user) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const currentPasswordMatches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentPasswordMatches) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
        passwordChangeSource: "self_reset",
      },
      $unset: {
        tempPassword: 1,
        passwordResetTokenHash: 1,
        passwordResetExpiresAt: 1,
      },
    }
  );

  await recordActivity({
    actor: String(user._id),
    targetUser: String(user._id),
    type: "user.password_changed",
    label: "Changed account password",
    entityType: "User",
    entityId: String(user._id),
  });

  return NextResponse.json({ ok: true });
}
