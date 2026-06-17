import { Schema, model, models, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    username: { type: String, unique: true, sparse: true, index: true }, // e.g. "Maira@ENV"
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    tempPassword: { type: String },
    role: { type: String, enum: ["student", "instructor", "admin"], default: "student", index: true },
    phone: { type: String, index: true },
    gender: { type: String, enum: ["male", "female", "other", "not_available"], default: "not_available", index: true },
    avatar: { type: String, default: "" }, // hex color or URL
    fideId: { type: String },
    rating: { type: Number, default: 0 },
    tags: [{ type: String, index: true }],
    batches: [{ type: Schema.Types.ObjectId, ref: "Batch", index: true }],
    classrooms: [{ type: Schema.Types.ObjectId, ref: "Classroom" }],
    notes: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    passwordResetTokenHash: { type: String, index: true },
    passwordResetExpiresAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ name: "text", email: "text", username: "text" });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: any };
export const User = models.User || model("User", UserSchema);

// Auto-generate a username like "Firstname@ENV" — collision-safe via counter suffix.
export async function generateUsername(name: string): Promise<string> {
  const first = (name.trim().split(/\s+/)[0] || "user")
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^./, (c) => c.toUpperCase());
  const base = `${first}@ENV`;
  let candidate = base;
  let i = 1;
  while (await User.exists({ username: candidate })) {
    i += 1;
    candidate = `${first}${i}@ENV`;
  }
  return candidate;
}
