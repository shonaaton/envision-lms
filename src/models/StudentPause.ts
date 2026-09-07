import { Schema, model, models, type InferSchemaType } from "mongoose";

// A single student stepping out of a running batch for a fixed window. The batch
// keeps running for everyone else, so this is tracked per student rather than by
// removing them from the batch — the record is what lets us put them back.
const VoidedInvoiceSchema = new Schema(
  {
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice" },
    invoiceNumber: String,
    title: String,
    dueDate: Date,
    totalAmount: Number,
    previousStatus: String,
  },
  { _id: false }
);

// Invoices are not voided by a pause - they move. The original due date is kept
// so the shift can be recalculated against the real restart date, or undone if
// the pause turns out to have been recorded by mistake.
const ShiftedInvoiceSchema = new Schema(
  {
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice" },
    invoiceNumber: String,
    title: String,
    originalDueDate: Date,
    dueDate: Date,
    totalAmount: Number,
    type: String,
  },
  { _id: false }
);

const StudentPauseSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "Batch", index: true },
    batchName: String,
    status: { type: String, enum: ["active", "resumed", "cancelled"], default: "active", index: true },

    pausedFrom: { type: Date, required: true, index: true },
    pausedUntil: { type: Date, required: true, index: true },
    expectedRestartDate: { type: Date, index: true },
    reason: String,
    // Set when the "your break ends soon" notice goes out, so the nightly sweep
    // sends it once rather than every night of the final week.
    expiryNoticeSentAt: { type: Date },

    pausedAt: { type: Date, default: Date.now, index: true },
    pausedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    pausedByName: String,
    pausedByRole: String,

    voidedInvoices: [VoidedInvoiceSchema],
    shiftedInvoices: [ShiftedInvoiceSchema],
    feeSnapshot: {
      assignment: { type: Schema.Types.ObjectId, ref: "FeeAssignment" },
      plan: { type: Schema.Types.ObjectId, ref: "FeePlan" },
      planName: String,
      planType: { type: String, enum: ["monthly", "credits"] },
      billingStartDate: Date,
      firstDueDate: Date,
    },

    resumedAt: Date,
    resumedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    resumedByName: String,
    resumeBatch: { type: Schema.Types.ObjectId, ref: "Batch", index: true },
    resumeBatchName: String,
    nextInvoiceDate: Date,
    resumeInvoice: { type: Schema.Types.ObjectId, ref: "Invoice" },
    resumeInvoiceNumber: String,
    restartDate: Date,
    pausedGroups: {
      batches: [{ type: Schema.Types.ObjectId, ref: "Batch" }],
      classrooms: [{ type: Schema.Types.ObjectId, ref: "Classroom" }],
    },
    resumeNote: String,

    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancelledByName: String,
    cancelReason: String,
  },
  { timestamps: true }
);

// One live pause per student; resumed/cancelled records stay as history.
StudentPauseSchema.index(
  { student: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
StudentPauseSchema.index({ status: 1, pausedUntil: 1 });

export type StudentPauseDoc = InferSchemaType<typeof StudentPauseSchema> & { _id: any };
export const StudentPause = models.StudentPause || model("StudentPause", StudentPauseSchema);
