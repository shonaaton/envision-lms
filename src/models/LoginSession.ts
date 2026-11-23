import { Schema, model, models } from "mongoose";

// A presence record, never an authentication credential.
const schema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
});
schema.index({ user: 1, expiresAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LoginSession = models.LoginSession || model("LoginSession", schema);
