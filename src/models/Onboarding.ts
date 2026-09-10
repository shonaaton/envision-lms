import { Schema, model, models, type InferSchemaType } from "mongoose";
import {
  CALCULATION_POWER,
  ENDGAME_KNOWLEDGE,
  OVERALL_STRENGTH,
  POSITIONAL_SENSE,
  TACTICAL_STRENGTH,
  scaleEnum,
} from "@/lib/demoAssessmentScales";

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

const DemoFeedbackSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    demoUser: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    attendance: { type: Schema.Types.ObjectId, ref: "Attendance", index: true },
    attendanceStatus: { type: String, enum: ["present", "absent", "student_no_show"], default: "present", index: true },
    chessLevel: String,
    playingStrength: String,
    hasFideRating: Boolean,
    fideRating: Number,
    chessComRating: Number,
    lichessRating: Number,
    assessmentNotes: String,
    strengths: String,
    weaknesses: String,
    /**
     * Whether a salesperson sat in on the demo, and which one. The name is
     * snapshotted alongside the reference because sales staff leave and the
     * assessment still has to say who was in that call a year later.
     */
    salesPersonPresent: { type: Boolean, default: false },
    salesPerson: { type: Schema.Types.ObjectId, ref: "User" },
    salesPersonName: String,
    /** A tier from `COURSE_TIERS` since the demo assessment became a dropdown. */
    recommendedCourseLevel: String,
    /** "Level 1".."Level 3" within the tier, from `demoCurriculum`. */
    recommendedSubLevel: String,
    recommendedStartingTopic: String,
    /** Position of the starting topic in the tier - what the batch calls Session N. */
    recommendedStartingSession: Number,
    /** Graded ladders, defined in `demoAssessmentScales`. "" means not rated. */
    calculationPower: { type: String, enum: scaleEnum(CALCULATION_POWER), default: "" },
    tacticalStrength: { type: String, enum: scaleEnum(TACTICAL_STRENGTH), default: "" },
    endgameKnowledge: { type: String, enum: scaleEnum(ENDGAME_KNOWLEDGE), default: "" },
    positionalSense: { type: String, enum: scaleEnum(POSITIONAL_SENSE), default: "" },
    overallStrength: { type: String, enum: scaleEnum(OVERALL_STRENGTH), default: "" },
    studentEngagement: { type: String, enum: ["high", "medium", "low", ""], default: "" },
    coachRecommendation: { type: String, enum: ["group", "individual", "either", ""], default: "" },
    suggestedClassFrequency: String,
    recommendedCoach: { type: Schema.Types.ObjectId, ref: "User" },
    coachComments: String,
    parentFacingSummary: String,
    internalCoachNotes: String,
    salesAdminNotes: String,
    status: { type: String, enum: ["draft", "submitted"], default: "draft", index: true },
    extensibleData: { type: Schema.Types.Mixed, default: {} },
    submittedAt: Date,
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

DemoFeedbackSchema.index({ booking: 1, classroom: 1 }, { unique: true });

export type CoachApplicationDoc = InferSchemaType<typeof CoachApplicationSchema> & { _id: any };
export type DemoBookingDoc = InferSchemaType<typeof DemoBookingSchema> & { _id: any };
export type DemoFeedbackDoc = InferSchemaType<typeof DemoFeedbackSchema> & { _id: any };

export const CoachApplication = models.CoachApplication || model("CoachApplication", CoachApplicationSchema);
export const DemoBooking = models.DemoBooking || model("DemoBooking", DemoBookingSchema);
export const DemoFeedback = models.DemoFeedback || model("DemoFeedback", DemoFeedbackSchema);
