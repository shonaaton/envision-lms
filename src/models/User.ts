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
