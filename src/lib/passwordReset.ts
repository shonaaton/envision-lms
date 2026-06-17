import crypto from "crypto";

export const PASSWORD_RESET_WINDOW_MINUTES = 30;

export function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_WINDOW_MINUTES * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
