import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One call attempt to a family by the retention team: the monthly check-in,
 * a risk call, a callback, a renewal or a win-back call. A family is everyone
 * on one phone number (siblings share the parent's), so one call covers every
 * child on it. Rules live in lib/retention/familyRules.ts, writes in
 * familyCallService.ts.
 */
export const FAMILY_CALL_KINDS = ["monthly", "risk", "callback", "renewal", "win_back", "other"] as const;
export const FAMILY_CALL_OUTCOMES = ["connected", "callback_requested", "no_answer", "busy", "switched_off", "wrong_number"] as const;
export const FAMILY_CALL_ACTION_TYPES = ["timing_change", "batch_change", "coach_concern", "fee_question", "tech_issue", "rejoin", "other"] as const;
export const LEAVING_INTENTS = ["no", "maybe", "yes"] as const;
const MESSAGE_STATES = ["sent", "skipped", "failed", "template_pending"] as const;

const FamilyCallSchema = new Schema(
  {
    // `phone:<canonical number>`, or `student:<id>` for a family with no phone on file.
    familyKey: { type: String, required: true, index: true },
    students: [{ type: Schema.Types.ObjectId, ref: "User" }],
    primaryStudent: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Academy (IST) month the call belongs to, "YYYY-MM".
    monthKey: { type: String, required: true },
    kind: { type: String, enum: FAMILY_CALL_KINDS, default: "monthly" },
    outcome: { type: String, enum: FAMILY_CALL_OUTCOMES, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    byName: String,
    durationMinutes: Number,
    // Asked on every call that connected.
    satisfaction: { type: Number, min: 1, max: 5 },
    leavingIntent: { type: String, enum: LEAVING_INTENTS },
    answers: [
      {
        _id: false,
        questionId: { type: Schema.Types.ObjectId, ref: "FamilyCallQuestion" },
        // Copied in, so editing a question later never rewrites an old call.
        question: String,
        // Spelled out: a bare `type: String` here would declare the whole array as strings.
        type: { type: String },
        answer: String,
        student: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
    // The caller's own questions on this call.
    extraQuestions: [{ _id: false, question: String, answer: String }],
    notes: String,
    // What the parent is told in the thank-you message.
    parentSummary: String,
    // The one note a coach sees. Fee and pause details never go here.
    coachNote: { text: String, sharedAt: Date },
    // What the child is not doing, as shown to the caller at the time of the call.
    talkingPoints: [
      {
        _id: false,
        student: { type: Schema.Types.ObjectId, ref: "User" },
        code: String,
        label: String,
        discussed: Boolean,
      },
    ],
    // Each item keeps its own _id: it is the reference of the task it raised.
    actionItems: [
      {
        type: { type: String, enum: FAMILY_CALL_ACTION_TYPES },
        note: String,
        task: { type: Schema.Types.ObjectId, ref: "InternalTask" },
      },
    ],
    callbackAt: Date,
    flags: [{ type: Schema.Types.ObjectId, ref: "RetentionFlag" }],
    message: {
      kind: { type: String, enum: ["summary", "missed"] },
      whatsapp: { type: String, enum: MESSAGE_STATES },
      email: { type: String, enum: MESSAGE_STATES },
      at: Date,
      error: String,
    },
  },
  { timestamps: true }
);

FamilyCallSchema.index({ familyKey: 1, at: -1 });
FamilyCallSchema.index({ students: 1, at: -1 });
FamilyCallSchema.index({ monthKey: 1, kind: 1 });
FamilyCallSchema.index({ by: 1, at: -1 });
FamilyCallSchema.index({ at: -1 });

export const FAMILY_QUESTION_TYPES = ["text", "yesno", "choice", "rating"] as const;

/** The set questions the caller asks. Edited on the Retention Center's Questions tab. */
const FamilyCallQuestionSchema = new Schema(
  {
    text: { type: String, required: true },
    type: { type: String, enum: FAMILY_QUESTION_TYPES, default: "text" },
    options: [String],
    // Asked once per child rather than once per family.
    perStudent: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
    // Set on the starter questions, so seeding never adds them twice or brings back an edited one.
    seedKey: { type: String, unique: true, sparse: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export type FamilyCallDoc = InferSchemaType<typeof FamilyCallSchema> & { _id: any };
export const FamilyCall = models.FamilyCall || model("FamilyCall", FamilyCallSchema);
export const FamilyCallQuestion = models.FamilyCallQuestion || model("FamilyCallQuestion", FamilyCallQuestionSchema);
