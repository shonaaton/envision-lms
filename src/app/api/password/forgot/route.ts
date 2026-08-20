import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { createPasswordResetToken, PASSWORD_RESET_WINDOW_MINUTES } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/emailAutomation";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";

export const dynamic = "force-dynamic";
const PASSWORD_RESET_COOLDOWN_MS = 2 * 60 * 1000;

const GENERIC_RESET_RESPONSE = {
  ok: true,
  message: "If an account exists for that email or username, a reset link has been sent.",
};

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => ({}));
    const clientIp = getClientIp(req.headers);
    const ipLimit = consumeRateLimit(`password-forgot:ip:${clientIp}`, 6, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(GENERIC_RESET_RESPONSE, {
        status: 429,
        headers: jsonRateLimitHeaders(ipLimit),
      });
    }
    const login = String(body.login || body.email || "").trim();
    if (!login) {
      return NextResponse.json({ error: "Email or username is required." }, { status: 400 });
    }

    const normalized = login.toLowerCase();
    const targetLimit = consumeRateLimit(`password-forgot:target:${normalized}`, 3, 15 * 60 * 1000);
    if (!targetLimit.allowed) {
      return NextResponse.json(GENERIC_RESET_RESPONSE, {
        status: 429,
        headers: jsonRateLimitHeaders(targetLimit),
      });
    }
    const user: any = await User.findOne({
      $or: [{ email: normalized }, { username: login }, { username: normalized }],
    }).lean();

    if (!user) {
      return NextResponse.json(GENERIC_RESET_RESPONSE);
    }
    if (
      user.passwordResetRequestedAt &&
      Date.now() - new Date(user.passwordResetRequestedAt).getTime() < PASSWORD_RESET_COOLDOWN_MS
    ) {
      return NextResponse.json(GENERIC_RESET_RESPONSE);
    }

    const { token, tokenHash, expiresAt } = createPasswordResetToken();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
          passwordResetRequestedAt: new Date(),
        },
      }
    );

    const appUrl = resolvePublicAppUrl(req, { allowRequestHeaders: false });
    if (!appUrl) {
      await User.updateOne(
        { _id: user._id, passwordResetTokenHash: tokenHash },
        { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 } }
      );
      console.error("Password reset email skipped because no trusted public LMS URL is configured.");
      return NextResponse.json(GENERIC_RESET_RESPONSE);
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
        { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 } }
      );
    }

    if (delivery.skipped) {
      console.error("Password reset email skipped because delivery is not configured.");
      return NextResponse.json(GENERIC_RESET_RESPONSE);
    }

    if (!delivery.delivered) {
      console.error("Password reset email could not be delivered.");
      return NextResponse.json(GENERIC_RESET_RESPONSE);
    }

    return NextResponse.json(GENERIC_RESET_RESPONSE);
  } catch (error) {
    console.error("Password reset request failed", error);
    return NextResponse.json({ error: "Could not start the password reset. Please try again." }, { status: 500 });
  }
}
