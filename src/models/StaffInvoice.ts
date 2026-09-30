import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Monthly invoices staff raise to the academy.
 *
 * - `StaffPayoutProfile` - who is invoicing and where to pay them: name,
 *   address, PAN, bank account, next invoice number and their signature. Kept
 *   out of `User` so the PAN and account number never ride along on the many
 *   queries that read users.
 * - `StaffInvoice` - one per person per month. Everything printed is a
 *   snapshot, so editing bank details or a rate later never changes an
 *   invoice already sent.
 *
 * Amounts are paise.
 */

const StaffPayoutProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    pan: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    branchName: { type: String, required: true, trim: true },
    ifsc: { type: String, required: true, trim: true },
    accountType: { type: String, enum: ["savings", "current"], default: "savings" },
    /** Suggested for the next new invoice; bumped each time one is raised. */
    nextInvoiceNumber: { type: String, required: true, trim: true },
    // A small PNG as a data URL. Not a file under /uploads: those are public to
    // anyone with the link and are lost on every redeploy.
    signature: { type: String, default: "" },
    signatureUpdatedAt: Date,
  },
  { timestamps: true }
);

const BankSnapshotSchema = new Schema(
  {
    accountHolder: String,
    bankName: String,
    accountNumber: String,
    branchName: String,
    ifsc: String,
    accountType: String,
  },
  { _id: false }
);

const StaffInvoiceLineSchema = new Schema(
  {
    group: { type: String, enum: ["class", "demo", "bonus", "monthly", "manual"], required: true },
    kind: { type: String, enum: ["regular", "demo", "demoConversionBonus", "substitute", "monthly", "manual"], required: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom" },
    title: { type: String, required: true },
    batchName: String,
    quantity: { type: Number, required: true },
    minutes: { type: Number, default: 0 },
    /** How `rate` reads: per class, per hour, or the month's fixed amount. */
    unit: { type: String, enum: ["per_class", "per_hour", "per_month"], default: "per_class" },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
    note: { type: String, default: "" },
    /** `academy` lines are priced from the academy's rates; `manual` ones were typed by the staff member. */
    rateSource: { type: String, enum: ["academy", "coach_entered", "manual"], required: true },
    sessionIds: { type: [String], default: [] },
  },
  { _id: false }
);

const StaffInvoiceSchema = new Schema(
  {
    staff: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    month: { type: String, required: true, index: true }, // "YYYY-MM"
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },

    billFrom: {
      fullName: String,
      address: String,
      pan: String,
      email: String,
      phone: String,
      bank: { type: BankSnapshotSchema, default: () => ({}) },
    },
    billTo: { type: Schema.Types.Mixed },
    signature: { type: String, default: "" },

    lines: { type: [StaffInvoiceLineSchema], default: [] },
    excludedPending: {
      count: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    total: { type: Number, required: true },
    totalInWords: { type: String, required: true },
    proposals: [{ type: Schema.Types.ObjectId, ref: "CoachPayProposal" }],

    status: { type: String, enum: ["submitted", "paid"], default: "submitted", index: true },
    generatedAt: { type: Date, default: Date.now },
    generatedCount: { type: Number, default: 1 },
    paidAt: Date,
    paidBy: { type: Schema.Types.ObjectId, ref: "User" },
    paymentReference: String,
  },
  { timestamps: true }
);

StaffInvoiceSchema.index({ staff: 1, month: 1 }, { unique: true });
StaffInvoiceSchema.index({ staff: 1, invoiceNumber: 1 }, { unique: true });

export type StaffPayoutProfileDoc = InferSchemaType<typeof StaffPayoutProfileSchema> & { _id: any };
export type StaffInvoiceDoc = InferSchemaType<typeof StaffInvoiceSchema> & { _id: any };

export const StaffPayoutProfile = models.StaffPayoutProfile || model("StaffPayoutProfile", StaffPayoutProfileSchema);
export const StaffInvoice = models.StaffInvoice || model("StaffInvoice", StaffInvoiceSchema);
