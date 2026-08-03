import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { hashPasswordResetToken } from "@/lib/passwordReset";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await dbConnect();
  const token = new URL(req.url).searchParams.get("token")?.trim() || "";
  if (!token) return NextResponse.json({ valid: false, error: "Reset token is missing." }, { status: 400 });

  const user = await User.exists({
    passwordResetTokenHash: hashPasswordResetToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) return NextResponse.json({ valid: false, error: "This reset link is invalid, expired, or already used." }, { status: 400 });
  return NextResponse.json({ valid: true });
}

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!token) return NextResponse.json({ error: "Reset token is missing." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters long." }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      {
        passwordResetTokenHash: hashPasswordResetToken(token),
        passwordResetExpiresAt: { $gt: new Date() },
      },
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
      },
      { new: true }
    ).select("_id");

    if (!user) {
      return NextResponse.json({ error: "This reset link is invalid, expired, or already used." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Password reset failed", error);
    return NextResponse.json({ error: "Could not reset the password. Please try again." }, { status: 500 });
  }
}
