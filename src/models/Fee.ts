import { Schema, model, models, type InferSchemaType } from "mongoose";

const AcademySettingsSchema = new Schema(
  {
    academyName: { type: String, default: "Envision Chess Academy" },
    registeredAddress: { type: String, default: "" },
    gstNumber: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    phone: { type: String, default: "" },
    authorizedSignatory: { type: String, default: "" },
    invoiceMode: { type: String, enum: ["gst", "non_gst"], default: "non_gst" },
    gstPercentage: { type: Number, default: 18 },
    invoicePrefix: { type: String, default: "INV" },
  },
  { timestamps: true }
);

const FeePlanSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    type: { type: String, enum: ["monthly", "credits"], required: true, index: true },
    amount: { type: Number, required: true },
    credits: { type: Number, default: 0 },
    billingDay: { type: Number, min: 1, max: 28, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const FeeAssignmentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    plan: { type: Schema.Types.ObjectId, ref: "FeePlan", required: true, index: true },
    type: { type: String, enum: ["monthly", "credits"], required: true },
    billingStartDate: { type: Date, required: true },
    creditBalance: { type: Number, default: 0 },
    totalCreditsPurchased: { type: Number, default: 0 },
    totalCreditsConsumed: { type: Number, default: 0 },
    history: [
      {
        plan: { type: Schema.Types.ObjectId, ref: "FeePlan" },
        type: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

const InvoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, unique: true, sparse: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: Schema.Types.ObjectId, ref: "FeePlan", index: true },
    assignment: { type: Schema.Types.ObjectId, ref: "FeeAssignment", index: true },
    type: { type: String, enum: ["monthly", "credits", "manual"], required: true, index: true },
    title: { type: String, required: true },
    issueDate: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date, required: true, index: true },
    amount: { type: Number, required: true },
    lateFee: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    gstPercentage: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    credits: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "unpaid", "paid", "overdue", "cancelled"], default: "unpaid", index: true },
    paidAt: Date,
    payment: { type: Schema.Types.ObjectId, ref: "Payment" },
    notes: String,
  },
  { timestamps: true }
);

const CreditLedgerSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignment: { type: Schema.Types.ObjectId, ref: "FeeAssignment", index: true },
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", index: true },
    type: { type: String, enum: ["purchase", "attendance_consumption", "adjustment"], required: true, index: true },
    credits: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    sourceType: { type: String, index: true },
    sourceId: { type: Schema.Types.ObjectId, index: true },
    note: String,
  },
  { timestamps: true }
);

CreditLedgerSchema.index({ student: 1, sourceType: 1, sourceId: 1, type: 1 }, { unique: true, sparse: true });

export type AcademySettingsDoc = InferSchemaType<typeof AcademySettingsSchema> & { _id: any };
export type FeePlanDoc = InferSchemaType<typeof FeePlanSchema> & { _id: any };
export type FeeAssignmentDoc = InferSchemaType<typeof FeeAssignmentSchema> & { _id: any };
export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema> & { _id: any };
export type CreditLedgerDoc = InferSchemaType<typeof CreditLedgerSchema> & { _id: any };

export const AcademySettings = models.AcademySettings || model("AcademySettings", AcademySettingsSchema);
export const FeePlan = models.FeePlan || model("FeePlan", FeePlanSchema);
export const FeeAssignment = models.FeeAssignment || model("FeeAssignment", FeeAssignmentSchema);
export const Invoice = models.Invoice || model("Invoice", InvoiceSchema);
export const CreditLedger = models.CreditLedger || model("CreditLedger", CreditLedgerSchema);
