import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { createPasswordResetToken, PASSWORD_RESET_WINDOW_MINUTES } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/emailAutomation";
import { resolvePublicAppUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => ({}));
    const login = String(body.login || body.email || "").trim();
    if (!login) {
      return NextResponse.json({ error: "Email or username is required." }, { status: 400 });
    }

    const normalized = login.toLowerCase();
    const user: any = await User.findOne({
      $or: [{ email: normalized }, { username: login }, { username: normalized }],
    }).lean();

    if (!user) {
      return NextResponse.json({
        ok: true,
        message: "If an account exists for that email or username, a reset link has been sent.",
      });
    }

    const { token, tokenHash, expiresAt } = createPasswordResetToken();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
        },
      }
    );

    const appUrl = resolvePublicAppUrl(req);
    if (!appUrl) {
      await User.updateOne(
        { _id: user._id, passwordResetTokenHash: tokenHash },
        { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
      );
      return NextResponse.json({ error: "The public LMS address is not configured correctly." }, { status: 503 });
    }
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const delivery = await sendPasswordResetEmail({
      to: user.email,
      subject: "Reset your Envision Chess Academy password",
      message: [
        `Hello ${user.name || "Player"},`,
        "",
        `Use this link to reset your password. It stays active for ${PASSWORD_RESET_WINDOW_MINUTES} minutes.`,
        "",
        "If you did not request this change, you can safely ignore this email.",
      ].join("\n"),
      metadata: {
        kind: "password_reset",
        resetUrl,
        previewText: `Reset your password within ${PASSWORD_RESET_WINDOW_MINUTES} minutes.`,
        userId: String(user._id),
      },
    });

    if (delivery.skipped || !delivery.delivered) {
      await User.updateOne(
        { _id: user._id, passwordResetTokenHash: tokenHash },
        { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
      );
    }

    if (delivery.skipped) {
      return NextResponse.json({ error: "Password reset email is not configured yet. Please contact the academy administrator." }, { status: 503 });
    }

    if (!delivery.delivered) {
      return NextResponse.json({ error: "Could not send the password reset email. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email or username, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Password reset request failed", error);
    return NextResponse.json({ error: "Could not start the password reset. Please try again." }, { status: 500 });
  }
}
