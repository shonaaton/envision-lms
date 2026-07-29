import { Schema, model, models, type InferSchemaType } from "mongoose";
import { ACADEMY_DEFAULTS, ACADEMY_FAVICON_URL, ACADEMY_LOGO_URL, ACADEMY_SIGNATURE_URL } from "@/lib/branding";

const AcademySettingsSchema = new Schema(
  {
    academyName: { type: String, default: ACADEMY_DEFAULTS.academyName },
    registeredAddress: { type: String, default: ACADEMY_DEFAULTS.registeredAddress },
    gstNumber: { type: String, default: ACADEMY_DEFAULTS.gstNumber },
    email: { type: String, default: ACADEMY_DEFAULTS.email },
    logoUrl: { type: String, default: ACADEMY_LOGO_URL },
    signatoryUrl: { type: String, default: ACADEMY_SIGNATURE_URL },
    faviconUrl: { type: String, default: ACADEMY_FAVICON_URL },
    phone: { type: String, default: ACADEMY_DEFAULTS.phone },
    authorizedSignatory: { type: String, default: ACADEMY_DEFAULTS.authorizedSignatory },
    invoiceFooter: { type: String, default: "" },
    invoiceMode: { type: String, enum: ["gst", "non_gst"], default: "non_gst" },
    gstPercentage: { type: Number, default: 18 },
    invoicePrefix: { type: String, default: "ENV" },
    lowCreditThreshold: { type: Number, default: 3 },
  },
  { timestamps: true }
);

const FeePlanSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    type: { type: String, enum: ["monthly", "credits"], required: true, index: true },
    amount: { type: Number, required: true },
    gstMode: { type: String, enum: ["included", "excluded", "non_gst"], default: "non_gst", index: true },
    gstPercentage: { type: Number, default: 18 },
    credits: { type: Number, default: 0 },
    billingDay: { type: Number, min: 1, max: 28, default: 1 },
    billingCycle: { type: String, enum: ["monthly"], default: "monthly" },
    dueAfterDays: { type: Number, default: 0 },
    lateFeeAmount: { type: Number, default: 50000 },
    lateFeeAfterDays: { type: Number, default: 10 },
    creditValidityDays: { type: Number, default: 0 },
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
    lastCreditReminderAt: Date,
    lastCreditReminderTo: String,
    lastCreditReminderStatus: { type: String, enum: ["sent", "failed", "skipped", "missing_email", "not_configured"], default: undefined },
    history: [{ type: Schema.Types.Mixed }],
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
    invoiceMode: { type: String, enum: ["included", "excluded", "non_gst"], default: "non_gst", index: true },
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
    publicDownloadTokenHash: { type: String, index: true },
    publicDownloadTokenExpiresAt: Date,
    lastSentAt: Date,
    lastSentTo: String,
    lastEmailStatus: { type: String, enum: ["sent", "failed", "skipped", "missing_email", "not_configured"], default: undefined },
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

const NotificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    readAt: Date,
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export type AcademySettingsDoc = InferSchemaType<typeof AcademySettingsSchema> & { _id: any };
export type FeePlanDoc = InferSchemaType<typeof FeePlanSchema> & { _id: any };
export type FeeAssignmentDoc = InferSchemaType<typeof FeeAssignmentSchema> & { _id: any };
export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema> & { _id: any };
export type CreditLedgerDoc = InferSchemaType<typeof CreditLedgerSchema> & { _id: any };
export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & { _id: any };

export const AcademySettings = models.AcademySettings || model("AcademySettings", AcademySettingsSchema);
export const FeePlan = models.FeePlan || model("FeePlan", FeePlanSchema);
export const FeeAssignment = models.FeeAssignment || model("FeeAssignment", FeeAssignmentSchema);
export const Invoice = models.Invoice || model("Invoice", InvoiceSchema);
export const CreditLedger = models.CreditLedger || model("CreditLedger", CreditLedgerSchema);
export const Notification = models.Notification || model("Notification", NotificationSchema);
