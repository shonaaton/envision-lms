import { Schema, model, models, type InferSchemaType } from "mongoose";

const CoachApplicationSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    phone: { type: String },
    countryCode: { type: String },
    city: { type: String },
    country: { type: String },
    experience: { type: String },
    playingLevel: { type: String },
    fideId: { type: String },
    rating: { type: Number, default: 0 },
    preferredStudents: { type: String },
    availabilityNote: { type: String },
    documentsUrl: { type: String },
    message: { type: String },
    status: { type: String, enum: ["pending", "shortlisted", "approved", "rejected"], default: "pending", index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    convertedUser: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const DemoBookingSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", index: true },
    studentName: { type: String, required: true, index: true },
    parentName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    countryCode: { type: String },
    phone: { type: String, required: true },
    city: { type: String },
    country: { type: String },
    level: { type: String, enum: ["absolute_beginner", "beginner", "intermediate", "advanced", "federated"], required: true },
    requestedCoach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    approvedCoach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: ["pending_admin", "approved", "rescheduled", "cancelled", "converted"], default: "pending_admin", index: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom" },
    adminNote: String,
    acceptedPrivacyAt: Date,
    acceptedTermsAt: Date,
    acceptedRefundAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    convertedBy: { type: Schema.Types.ObjectId, ref: "User" },
    convertedAt: Date,
  },
  { timestamps: true }
);

export type CoachApplicationDoc = InferSchemaType<typeof CoachApplicationSchema> & { _id: any };
export type DemoBookingDoc = InferSchemaType<typeof DemoBookingSchema> & { _id: any };

export const CoachApplication = models.CoachApplication || model("CoachApplication", CoachApplicationSchema);
export const DemoBooking = models.DemoBooking || model("DemoBooking", DemoBookingSchema);
