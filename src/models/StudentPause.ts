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

    pausedAt: { type: Date, default: Date.now, index: true },
    pausedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    pausedByName: String,
    pausedByRole: String,

    voidedInvoices: [VoidedInvoiceSchema],
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
