import { escapeRegex } from "@/lib/loginIdentity";
import { Schema, model, models, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    username: { type: String, unique: true, sparse: true, index: true }, // e.g. "Maira@ENV"
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    tempPassword: { type: String },
    passwordChangedAt: { type: Date },
    passwordChangeSource: { type: String, enum: ["registration", "admin_reset", "self_reset"], default: "registration" },
    role: { type: String, enum: ["student", "instructor", "admin", "sub-admin"], default: "student", index: true },
    accessRole: { type: Schema.Types.ObjectId, ref: "AccessRole", default: null, index: true },
    isSuperAdmin: { type: Boolean, default: false, index: true },
    accountStatus: {
      type: String,
      enum: ["demo", "enrolled", "coach_applicant", "approved", "rejected"],
      default: "enrolled",
      index: true,
    },
    demoLimits: {
      playComputer: { type: Number, default: 3 },
      squareTrainer: { type: Number, default: 3 },
      tacticsTrainer: { type: Number, default: 3 },
      kingHunt: { type: Number, default: 3 },
      analysisBoard: { type: Number, default: 3 },
    },
    demoUsage: {
      playComputer: { type: Number, default: 0 },
      squareTrainer: { type: Number, default: 0 },
      tacticsTrainer: { type: Number, default: 0 },
      kingHunt: { type: Number, default: 0 },
      analysisBoard: { type: Number, default: 0 },
    },
    demoExpiresAt: { type: Date, index: true },
    demoExtensionCount: { type: Number, default: 0 },
    conversionSetup: {
      recommendedLevel: String,
      course: { type: Schema.Types.ObjectId, ref: "Course" },
      courseName: String,
      classType: { type: String, enum: ["group", "individual", "either", ""] },
      startingDate: Date,
      batch: { type: Schema.Types.ObjectId, ref: "Batch" },
      convertedFromBooking: { type: Schema.Types.ObjectId, ref: "Booking" },
      convertedAt: Date,
      convertedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    parentName: { type: String },
    parentEmail: { type: String, lowercase: true, index: true },
    // When this family was last asked for a Google review. A review request is
    // a favour to ask, not a broadcast, so it is rate limited per family rather
    // than sent on every qualifying milestone.
    reviewRequestedAt: { type: Date, index: true },
    city: { type: String },
    country: { type: String },
    countryCode: { type: String },
    studentLevel: { type: String, enum: ["absolute_beginner", "beginner", "intermediate", "advanced", "federated", "not_set"], default: "not_set", index: true },
    acceptedPrivacyAt: Date,
    acceptedTermsAt: Date,
    acceptedRefundAt: Date,
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
    // Stamped when `isActive` is turned off so churn reporting knows when a
    // student actually left. Legacy rows fall back to `updatedAt`.
    deactivatedAt: { type: Date, index: true },
    // Batch pause — the student stays enrolled but is out of classes and billing
    // until `pausedUntil`. Full detail (dates, voided invoices, restart plan)
    // lives on the StudentPause record referenced by `pauseRecord`.
    isPaused: { type: Boolean, default: false, index: true },
    pausedUntil: { type: Date, index: true },
    pauseExpectedRestartDate: { type: Date },
    pauseRecord: { type: Schema.Types.ObjectId, ref: "StudentPause", index: true },
    failedLoginAttempts: { type: Number, default: 0 },
    loginLockedUntil: { type: Date },
    passwordResetTokenHash: { type: String, index: true },
    passwordResetExpiresAt: { type: Date },
    passwordResetRequestedAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ name: "text", email: "text", username: "text" });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: any };
export const User = models.User || model("User", UserSchema);

// Auto-generate a username like "Firstname@ENV" — collision-safe via counter suffix.
export async function generateUsername(name: string): Promise<string> {
  const first = (name.trim().split(/\s+/)[0] || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^./, (c) => c.toUpperCase()) || "User";
  const base = `${first}@ENV`;
  let candidate = base;
  let i = 1;
  // Case-insensitive check: sign-in matches user IDs without regard to case, so
  // `Rahul@ENV` and `rahul@ENV` must not both be handed out.
  while (await User.exists({ username: new RegExp(`^${escapeRegex(candidate)}$`, "i") })) {
    i += 1;
    candidate = `${first}${i}@ENV`;
  }
  return candidate;
}

function isDuplicateUsernameError(error: any) {
  if (!error || error.code !== 11000) return false;
  const fields = { ...(error.keyPattern || {}), ...(error.keyValue || {}) };
  return "username" in fields;
}

/**
 * Create an account and give it a user ID nobody else holds.
 *
 * `generateUsername` reads the collection and the insert happens afterwards, so
 * two people named Rahul signing up in the same moment — or one person
 * double-submitting the form — can both be told `Rahul@ENV` is free and both
 * write it. A second `Rahul@ENV` does not just collide: whoever logs in with
 * that ID is matched by a single `findOne`, so the older student is answered
 * with the newer account. The unique index rejects the loser of that race, and
 * this retries with the next free number instead of failing the sign-up.
 *
 * Every account must be created through here rather than calling
 * `generateUsername` and `User.create` separately.
 */
export async function createUserWithUsername(doc: Record<string, any>) {
  let lastError: any;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = await generateUsername(String(doc.name || ""));
    try {
      return await User.create({ ...doc, username });
    } catch (error: any) {
      if (!isDuplicateUsernameError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
