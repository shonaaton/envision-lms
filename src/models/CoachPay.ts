import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * What a coach is paid, and why.
 *
 * Three collections, each answering one question:
 *
 * - `CoachRate`   - the standing price list. Scoped, so one card can price the
 *                   whole academy and a more specific card overrides it.
 * - `SessionPayOverride` - the price of ONE class, typed by hand. This is where
 *                   a substitution rate goes when the sub is not on the normal
 *                   price list.
 * - `NoShowRuling` - an admin's decision about a class nobody taught through no
 *                   fault of the coach: pay them or not, and charge the student
 *                   or not. Those two answers are independent on purpose.
 *
 * Every amount is paise, like the rest of the billing code.
 */

export const COACH_RATE_SCOPES = ["academy", "coach", "batch", "batch_coach", "classroom", "classroom_coach"] as const;
export type CoachRateScope = (typeof COACH_RATE_SCOPES)[number];

export const RATE_UNITS = ["per_class", "per_hour"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const PAY_KINDS = ["regular", "demo", "demoConversionBonus", "substitute"] as const;
export type PayKind = (typeof PAY_KINDS)[number];

const RateValueSchema = new Schema(
  {
    // Paise. `null` is deliberately different from `0`: null means "this card
    // says nothing about this kind, keep looking down the ladder", while 0 means
    // "this card says the coach earns nothing for it". Collapsing the two would
    // make an explicit unpaid demo silently fall through to the academy default.
    amount: { type: Number, default: null },
    unit: { type: String, enum: RATE_UNITS, default: "per_class" },
  },
  { _id: false }
);

const CoachRateSchema = new Schema(
  {
    scope: { type: String, enum: COACH_RATE_SCOPES, required: true, index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    batch: { type: Schema.Types.ObjectId, ref: "Batch", index: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", index: true },

    regular: { type: RateValueSchema, default: () => ({}) },
    demo: { type: RateValueSchema, default: () => ({}) },
    demoConversionBonus: { type: RateValueSchema, default: () => ({}) },
    substitute: { type: RateValueSchema, default: () => ({}) },

    // A raise must not rewrite what last quarter cost. Payroll reads the card
    // with the latest `effectiveFrom` that is still on or before the class date,
    // so raising a rate means adding a card, never editing the old one.
    effectiveFrom: { type: Date, default: () => new Date(0), index: true },
    isActive: { type: Boolean, default: true, index: true },
    note: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One card per scope target per effective date. Re-saving the same date is an
// edit of that card, not a second card competing with it.
CoachRateSchema.index(
  { scope: 1, coach: 1, batch: 1, classroom: 1, effectiveFrom: 1 },
  { unique: true }
);

const SessionPayOverrideSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    // `generatedSessions._id` as a string. Sessions are subdocuments, so there
    // is no collection to reference.
    sessionId: { type: String, required: true, index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: PAY_KINDS, default: "substitute", index: true },
    amount: { type: Number, required: true }, // paise
    unit: { type: String, enum: RATE_UNITS, default: "per_class" },
    reason: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One price per coach per class. A class taught by a sub has one payee, so a
// second override for the same pair is an edit.
SessionPayOverrideSchema.index({ classroom: 1, sessionId: 1, coach: 1 }, { unique: true });

const NoShowRulingSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    sessionDate: { type: Date, index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    // What the session status was when the ruling was made, so a later status
    // change is visible rather than silently re-using a stale decision.
    sessionStatus: { type: String },

    // The two halves of the decision. They are independent: the common ruling
    // is "pay the coach, do not charge the student", which is only expressible
    // if neither answer implies the other.
    payCoach: { type: Boolean, default: true },
    deductStudentCredit: { type: Boolean, default: false },

    // Students the credit half applied to, and what actually moved. Recorded
    // because the automatic no-show rule may already have deducted before an
    // admin ruled, in which case ruling "do not deduct" means giving one back.
    creditActions: [
      new Schema(
        {
          student: { type: Schema.Types.ObjectId, ref: "User", required: true },
          action: { type: String, enum: ["deducted", "refunded", "none"], default: "none" },
          credits: { type: Number, default: 0 },
          balanceAfter: { type: Number, default: 0 },
          ledger: { type: Schema.Types.ObjectId, ref: "CreditLedger" },
        },
        { _id: false }
      ),
    ],

    note: String,
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    decidedByRole: { type: String, enum: ["admin", "sub-admin"] },
    decidedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

NoShowRulingSchema.index({ classroom: 1, sessionId: 1 }, { unique: true });

export type CoachRateDoc = InferSchemaType<typeof CoachRateSchema> & { _id: any };
export type SessionPayOverrideDoc = InferSchemaType<typeof SessionPayOverrideSchema> & { _id: any };
export type NoShowRulingDoc = InferSchemaType<typeof NoShowRulingSchema> & { _id: any };

export const CoachRate = models.CoachRate || model("CoachRate", CoachRateSchema);
export const SessionPayOverride = models.SessionPayOverride || model("SessionPayOverride", SessionPayOverrideSchema);
export const NoShowRuling = models.NoShowRuling || model("NoShowRuling", NoShowRulingSchema);
