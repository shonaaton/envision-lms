import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * The academy's own books, admin only (see lib/accounts/access.ts).
 *
 * - `AccountEntry` - a line the portal does not already know: a cost, offline
 *   fee income, or money that moves without being profit or loss (GST paid,
 *   TDS deposited, owner's money). Portal invoices and staff invoices are never
 *   copied in here; the dashboard reads them where they live.
 * - `BankStatementImport` / `BankTransaction` - an uploaded bank statement and
 *   its rows, each classified against the portal or turned into an entry.
 * - `AccountRule` - "narration contains X" -> category, learned from the
 *   admin's choices so the next statement mostly classifies itself.
 *
 * Amounts are paise. `month` is the academy (Kolkata) month, "YYYY-MM".
 */

const AccountEntrySchema = new Schema(
  {
    kind: { type: String, enum: ["income", "expense", "non_pl"], required: true, index: true },
    category: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    /** What was earned or spent. For teacher pay this is the gross, TDS included. */
    amount: { type: Number, required: true },
    /** GST inside `amount`, for income that carried GST. */
    gstAmount: { type: Number, default: 0 },
    /** TDS withheld from a coach - part of `amount`, owed to the government. */
    tdsAmount: { type: Number, default: 0 },
    description: { type: String, default: "", trim: true },
    counterparty: { type: String, default: "", trim: true },
    paymentMode: { type: String, default: "", trim: true },
    /** Where the money moved: the bank account, or the cash Sayantan holds for the academy. */
    account: { type: String, enum: ["bank", "cash"], default: "bank", index: true },
    /** Into or out of that account. Income comes in, a cost goes out; GST, TDS, owner money and transfers say which. */
    flow: { type: String, enum: ["in", "out"] },
    student: { type: Schema.Types.ObjectId, ref: "User", index: true },
    studentName: { type: String, default: "" },
    staff: { type: Schema.Types.ObjectId, ref: "User", index: true },
    source: { type: String, enum: ["manual", "csv_import", "bank_statement"], default: "manual", index: true },
    bankTransaction: { type: Schema.Types.ObjectId, ref: "BankTransaction", index: true },
    /** The portal bills this money paid, for a cash fee already billed and marked paid in the portal. */
    invoices: [{ type: Schema.Types.ObjectId, ref: "Invoice" }],
    importBatch: { type: String, default: "", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedAt: { type: Date, index: true },
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

AccountEntrySchema.index({ month: 1, kind: 1, voidedAt: 1 });

const BankStatementImportSchema = new Schema(
  {
    fileName: { type: String, required: true },
    accountLabel: { type: String, default: "", trim: true },
    periodFrom: Date,
    periodTo: Date,
    rowCount: { type: Number, default: 0 },
    newRows: { type: Number, default: 0 },
    duplicateRows: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    totalDebit: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const BankTransactionSchema = new Schema(
  {
    import: { type: Schema.Types.ObjectId, ref: "BankStatementImport", required: true, index: true },
    date: { type: Date, required: true, index: true },
    month: { type: String, required: true, index: true },
    narration: { type: String, default: "" },
    reference: { type: String, default: "", index: true },
    /** The admin's own label from the statement's spare column. */
    label: { type: String, default: "" },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    balance: { type: Number },
    /** Same row uploaded twice (overlapping statements) is recognised and skipped. */
    hash: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["unclassified", "matched_portal", "classified", "ignored"],
      default: "unclassified",
      index: true,
    },
    /** What the matcher proposed; the admin accepts or overrides it. */
    suggestion: {
      type: { type: String, default: "" },
      category: String,
      label: String,
      invoices: [{ type: Schema.Types.ObjectId, ref: "Invoice" }],
      payments: [{ type: Schema.Types.ObjectId, ref: "Payment" }],
      staffInvoice: { type: Schema.Types.ObjectId, ref: "StaffInvoice" },
      entry: { type: Schema.Types.ObjectId, ref: "AccountEntry" },
      staffId: { type: Schema.Types.ObjectId, ref: "User" },
      month: String,
      refund: Boolean,
    },
    matchedInvoices: [{ type: Schema.Types.ObjectId, ref: "Invoice" }],
    matchedPayments: [{ type: Schema.Types.ObjectId, ref: "Payment" }],
    matchedStaffInvoice: { type: Schema.Types.ObjectId, ref: "StaffInvoice" },
    /** A student fee that reached the bank. Summed per month against the portal's paid bills. */
    feeReceipt: { type: Boolean, default: false, index: true },
    entry: { type: Schema.Types.ObjectId, ref: "AccountEntry" },
    classifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    classifiedAt: Date,
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

BankTransactionSchema.index({ month: 1, status: 1 });

const AccountRuleSchema = new Schema(
  {
    /** Lower-case text looked for inside the narration. */
    pattern: { type: String, required: true, trim: true, lowercase: true },
    direction: { type: String, enum: ["debit", "credit"], required: true },
    category: { type: String, required: true },
    staff: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    hits: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AccountRuleSchema.index({ pattern: 1, direction: 1 }, { unique: true });

/** Single settings document for the books (key "default"). */
const AccountsSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    /** Cash held for the academy on the day the books start. Negative = the holder was owed. */
    openingCash: { type: Number, default: 0 },
    cashHolder: { type: String, default: "Sayantan", trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const AccountsSettings = models.AccountsSettings || model("AccountsSettings", AccountsSettingsSchema);

export type AccountEntryDoc = InferSchemaType<typeof AccountEntrySchema> & { _id: any };
export type BankStatementImportDoc = InferSchemaType<typeof BankStatementImportSchema> & { _id: any };
export type BankTransactionDoc = InferSchemaType<typeof BankTransactionSchema> & { _id: any };
export type AccountRuleDoc = InferSchemaType<typeof AccountRuleSchema> & { _id: any };

export const AccountEntry = models.AccountEntry || model("AccountEntry", AccountEntrySchema);
export const BankStatementImport = models.BankStatementImport || model("BankStatementImport", BankStatementImportSchema);
export const BankTransaction = models.BankTransaction || model("BankTransaction", BankTransactionSchema);
export const AccountRule = models.AccountRule || model("AccountRule", AccountRuleSchema);
