import "server-only";

import { Types, isValidObjectId } from "mongoose";

import { dbConnect } from "@/lib/db";
import { academyMonthOf } from "@/lib/feedback/feedbackCycleDates";
import { accountCategory, defaultFlow, isPayrollCategory, type MoneyAccount } from "@/lib/accounts/categories";
import { parseEntryAmount, parseEntryDate, teacherPayAmounts } from "@/lib/accounts/entryInput";
import { recordActivity } from "@/lib/activity";
import { AccountEntry } from "@/models/Accounts";
import { User } from "@/models/User";

export class AccountsError extends Error {}

export type EntryInput = {
  id?: string;
  category: string;
  date: string;
  /** Rupees as typed. */
  amount: string;
  /** For pay to people: whether `amount` is what they received (after TDS) or the full amount. */
  amountBasis?: "gross" | "net_paid";
  /** For pay to people: whether 10% TDS was withheld. */
  tdsDeducted?: boolean;
  /**
   * The month the money is for, when it is not the month it moved: teachers
   * are paid around the 7th for the month before. "YYYY-MM"; blank = the date's month.
   */
  month?: string;
  /** Money going the other way: a refund of a cost, or a fee paid back to a student. Stored negative. */
  refund?: boolean;
  /** Bank or cash. Bank statement rows are always bank. */
  account?: MoneyAccount;
  /** In or out of that account; defaults from the category. */
  flow?: "in" | "out";
  /** For income: the GST inside the amount, in rupees. Blank for non-GST. */
  gst?: string;
  description?: string;
  counterparty?: string;
  paymentMode?: string;
  /** Username, phone, email or name of the student an offline fee came from. */
  student?: string;
  source?: "manual" | "csv_import" | "bank_statement";
  bankTransaction?: string;
  importBatch?: string;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The student an offline fee belongs to, from whatever the admin typed:
 * username first (unique), then phone or email, then an exact name. A name
 * shared by two students is not guessed - the entry is saved without a
 * student and shows as unmatched.
 */
export async function findStudent(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (isValidObjectId(text)) {
    const byId: any = await User.findOne({ _id: text, role: "student" }).select("name username").lean();
    if (byId) return byId;
  }
  const byUsername: any = await User.findOne({ role: "student", username: new RegExp(`^${escapeRegex(text)}$`, "i") }).select("name username").lean();
  if (byUsername) return byUsername;
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 10) {
    const tail = digits.slice(-10);
    const byPhone: any[] = await User.find({ role: "student", phone: new RegExp(`${tail}$`) }).select("name username").limit(2).lean();
    if (byPhone.length === 1) return byPhone[0];
  }
  if (text.includes("@")) {
    const byEmail: any[] = await User.find({ role: "student", $or: [{ email: text.toLowerCase() }, { parentEmail: text.toLowerCase() }] })
      .select("name username")
      .limit(2)
      .lean();
    if (byEmail.length === 1) return byEmail[0];
  }
  const byName: any[] = await User.find({ role: "student", name: new RegExp(`^${escapeRegex(text)}$`, "i") }).select("name username").limit(2).lean();
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return null;
  // A first name alone ("Divit" for "Divit Agrawal"), when only one student has it.
  if (text.length < 3) return null;
  const byStart: any[] = await User.find({ role: "student", name: new RegExp(`^${escapeRegex(text)}(\\s|$)`, "i") }).select("name username").limit(2).lean();
  return byStart.length === 1 ? byStart[0] : null;
}

/** Validates and normalises an entry; throws AccountsError with a message the admin can act on. */
export async function buildEntry(input: EntryInput) {
  const category = accountCategory(String(input.category || ""));
  if (!category) throw new AccountsError("Pick a category.");
  const date = parseEntryDate(input.date);
  if (!date) throw new AccountsError("Enter the date as YYYY-MM-DD or DD/MM/YYYY.");
  const typed = parseEntryAmount(input.amount);
  if (typed === null || typed <= 0) throw new AccountsError("Enter an amount above zero.");

  let amount = typed;
  let tdsAmount = 0;
  if (isPayrollCategory(category.key) && !input.refund) {
    ({ amount, tdsAmount } = teacherPayAmounts(typed, input.amountBasis || "gross", input.tdsDeducted !== false));
  }
  const forMonth = String(input.month || "").trim();
  if (forMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(forMonth)) throw new AccountsError("The month must look like 2026-04.");

  let gstAmount = 0;
  if (category.kind === "income" && input.gst) {
    const gst = parseEntryAmount(input.gst);
    if (gst === null || gst < 0 || gst >= amount) throw new AccountsError("GST must be less than the amount it is part of.");
    gstAmount = gst;
  }

  let student: any = null;
  if ((category.key === "offline_fees" || category.key === "student_refunds") && input.student) student = await findStudent(input.student);

  return {
    kind: category.kind,
    category: category.key,
    month: forMonth || academyMonthOf(date),
    date,
    amount: input.refund ? -amount : amount,
    gstAmount,
    tdsAmount,
    description: String(input.description || "").trim().slice(0, 300),
    counterparty: String(input.counterparty || "").trim().slice(0, 120),
    paymentMode: String(input.paymentMode || "").trim().slice(0, 40),
    account: input.source === "bank_statement" ? "bank" : input.account === "cash" ? "cash" : "bank",
    flow: input.flow === "in" || input.flow === "out" ? input.flow : defaultFlow(category.key, input.refund),
    student: student?._id || undefined,
    studentName: student ? student.name || student.username : String(input.student || "").trim().slice(0, 120),
    source: input.source || "manual",
    bankTransaction: input.bankTransaction && isValidObjectId(input.bankTransaction) ? new Types.ObjectId(input.bankTransaction) : undefined,
    importBatch: input.importBatch || "",
  };
}

export async function saveEntry(input: EntryInput, actorId: string) {
  await dbConnect();
  const fields = await buildEntry(input);
  if (input.id) {
    if (!isValidObjectId(input.id)) throw new AccountsError("Unknown entry.");
    const existing: any = await AccountEntry.findById(input.id);
    if (!existing || existing.voidedAt) throw new AccountsError("Unknown entry.");
    // Where an entry came from is history, not something an edit changes.
    const { source: _source, bankTransaction: _bank, importBatch: _batch, ...editable } = fields;
    existing.set({ ...editable, updatedBy: actorId });
    if (!fields.student) existing.student = undefined;
    await existing.save();
    await recordActivity({
      actor: actorId,
      type: "accounts.entry.updated",
      label: `Edited ${fields.category} entry for ${fields.month}`,
      entityType: "AccountEntry",
      entityId: String(existing._id),
    });
    return existing;
  }
  const created = await AccountEntry.create({ ...fields, createdBy: actorId, updatedBy: actorId });
  await recordActivity({
    actor: actorId,
    type: "accounts.entry.created",
    label: `Added ${fields.category} entry for ${fields.month}`,
    entityType: "AccountEntry",
    entityId: String(created._id),
  });
  return created;
}

/** Voided, never deleted: the books keep a trail of what was removed and by whom. */
export async function voidEntry(id: string, actorId: string) {
  if (!isValidObjectId(id)) throw new AccountsError("Unknown entry.");
  await dbConnect();
  const entry: any = await AccountEntry.findById(id);
  if (!entry) throw new AccountsError("Unknown entry.");
  entry.voidedAt = new Date();
  entry.voidedBy = actorId;
  await entry.save();
  await recordActivity({
    actor: actorId,
    type: "accounts.entry.voided",
    label: `Removed ${entry.category} entry for ${entry.month}`,
    entityType: "AccountEntry",
    entityId: id,
  });
  return entry;
}

export type LedgerRow = {
  id: string;
  kind: string;
  category: string;
  month: string;
  date: string;
  amount: number;
  gstAmount: number;
  tdsAmount: number;
  description: string;
  counterparty: string;
  paymentMode: string;
  studentId: string;
  studentName: string;
  source: string;
  account: string;
  flow: string;
};

export async function listEntries(filter: { month?: string; category?: string; months?: string[] }): Promise<LedgerRow[]> {
  await dbConnect();
  const query: Record<string, any> = { voidedAt: null };
  if (filter.month) query.month = filter.month;
  else if (filter.months?.length) query.month = { $in: filter.months };
  if (filter.category) query.category = filter.category;
  const entries: any[] = await AccountEntry.find(query).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
  return entries.map((entry) => ({
    id: String(entry._id),
    kind: entry.kind,
    category: entry.category,
    month: entry.month,
    date: new Date(entry.date).toISOString(),
    amount: Number(entry.amount || 0),
    gstAmount: Number(entry.gstAmount || 0),
    tdsAmount: Number(entry.tdsAmount || 0),
    description: entry.description || "",
    counterparty: entry.counterparty || "",
    paymentMode: entry.paymentMode || "",
    studentId: entry.student ? String(entry.student) : "",
    studentName: entry.studentName || "",
    source: entry.source || "manual",
    account: entry.account || "bank",
    flow: entry.flow || defaultFlow(entry.category, Number(entry.amount) < 0),
  }));
}
