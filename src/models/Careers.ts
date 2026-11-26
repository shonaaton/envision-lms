import { Schema, model, models, type InferSchemaType } from "mongoose";
import { APPLICATION_STAGE_VALUES, BASIC_FIELDS, FIELD_MODES, JOB_STATUSES, QUESTION_TYPES } from "@/lib/careers/careersConfig";

/**
 * Job openings shown on /careers, and the applications made to them.
 * Rules and validation live in lib/careers/careersConfig.ts.
 */

const JobQuestionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    help: { type: String, default: "" },
    type: { type: String, enum: QUESTION_TYPES.map((item) => item.value), required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const JobPostingSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    department: { type: String, required: true, index: true },
    employmentType: { type: String, required: true },
    workMode: { type: String, required: true },
    location: { type: String, default: "" },
    summary: { type: String, default: "" },
    description: { type: String, default: "" },
    payNote: { type: String, default: "" },
    status: { type: String, enum: JOB_STATUSES, default: "draft", index: true },
    closesAt: { type: Date, default: null },
    order: { type: Number, default: 100 },
    basicFields: {
      type: new Schema(
        Object.fromEntries(BASIC_FIELDS.map((field) => [field.key, { type: String, enum: FIELD_MODES, default: field.defaultMode }])),
        { _id: false }
      ),
      default: () => ({}),
    },
    resume: { type: String, enum: FIELD_MODES, default: "optional" },
    questions: { type: [JobQuestionSchema], default: [] },
    hireRole: { type: String, enum: ["instructor", "sub-admin", "none"], default: "instructor" },
    hireAccessRole: { type: Schema.Types.ObjectId, ref: "AccessRole", default: null },
    publishedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const JobApplicationSchema = new Schema(
  {
    posting: { type: Schema.Types.ObjectId, ref: "JobPosting", required: true, index: true },
    /** Copied, so the application still reads right after the opening is edited or deleted. */
    postingTitle: { type: String, required: true },
    department: { type: String, index: true },

    name: { type: String, required: true },
    email: { type: String, lowercase: true, default: "" },
    countryCode: { type: String, default: "+91" },
    phone: { type: String, required: true },
    city: String,
    age: Number,
    currentRole: String,
    experienceYears: Number,
    languages: String,
    profileLink: String,
    fideId: String,
    chessRating: String,

    answers: {
      type: [
        new Schema(
          { questionId: String, question: String, type: { type: String }, answer: Schema.Types.Mixed },
          { _id: false }
        ),
      ],
      default: [],
    },
    resume: {
      type: new Schema({ storedName: String, name: String, mimeType: String, size: Number }, { _id: false }),
      default: null,
    },

    /** Saved but not submitted: the WhatsApp code has not been entered yet. Listed nowhere. */
    awaitingCode: { type: Boolean, default: undefined, index: true },
    whatsappVerifiedAt: Date,
    /** The code could not be sent at all, so the application went through unverified. */
    otpFailedAt: Date,
    /** Set once, when the team was told about it - guards against a double tap announcing twice. */
    announcedAt: Date,

    stage: { type: String, enum: APPLICATION_STAGE_VALUES, default: "new", index: true },
    stageChangedAt: Date,
    rating: { type: Number, min: 0, max: 5, default: 0 },
    interviewAt: Date,
    interviewLink: String,
    interviewNote: String,
    log: {
      type: [
        new Schema(
          {
            kind: { type: String, enum: ["note", "stage", "interview", "message", "system"], default: "note" },
            text: String,
            by: { type: Schema.Types.ObjectId, ref: "User" },
            byName: String,
            at: { type: Date, default: () => new Date() },
          },
          { _id: true }
        ),
      ],
      default: [],
    },
    convertedUser: { type: Schema.Types.ObjectId, ref: "User" },
    hiredAt: Date,
    /** The invite whose link this came through, if any (JobInvite). */
    invite: { type: Schema.Types.ObjectId, ref: "JobInvite", default: undefined },
    sourcePath: String,
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

JobApplicationSchema.index({ posting: 1, stage: 1, createdAt: -1 });
JobApplicationSchema.index({ posting: 1, countryCode: 1, phone: 1 });
JobApplicationSchema.index({ createdAt: -1 });

/**
 * Someone the team invited to apply ("Invite applicants" on the applications
 * page): a WhatsApp + email with their own link to the opening's form. It is
 * marked applied when an application for the same opening comes in through
 * the link or from the same WhatsApp number. Rules: lib/careers/inviteConfig.ts.
 */
const JobInviteSchema = new Schema(
  {
    posting: { type: Schema.Types.ObjectId, ref: "JobPosting", required: true, index: true },
    postingTitle: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, lowercase: true, default: "" },
    countryCode: { type: String, default: "+91" },
    phone: { type: String, required: true },
    /** The secret in the invite link (?invite=); fills the form in and ties the application back. */
    token: { type: String, required: true, unique: true },
    openedAt: Date,
    appliedAt: Date,
    application: { type: Schema.Types.ObjectId, ref: "JobApplication" },
    cancelledAt: Date,
    lastSentAt: Date,
    sendCount: { type: Number, default: 0 },
    /** Claimed by the reminder job, so the automatic reminder goes once. */
    autoReminderAt: Date,
    sends: {
      type: [
        new Schema(
          {
            kind: { type: String, enum: ["invite", "resend", "auto"], default: "invite" },
            at: { type: Date, default: () => new Date() },
            whatsapp: Boolean,
            email: Boolean,
            byName: String,
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
  },
  { timestamps: true }
);

JobInviteSchema.index({ posting: 1, countryCode: 1, phone: 1 });
JobInviteSchema.index({ appliedAt: 1, cancelledAt: 1, createdAt: -1 });

export type JobPostingDoc =InferSchemaType<typeof JobPostingSchema> & { _id: any };
export type JobApplicationDoc = InferSchemaType<typeof JobApplicationSchema> & { _id: any };

export const JobPosting = models.JobPosting || model("JobPosting", JobPostingSchema);
export const JobApplication = models.JobApplication || model("JobApplication", JobApplicationSchema);
export const JobInvite = models.JobInvite || model("JobInvite", JobInviteSchema);
