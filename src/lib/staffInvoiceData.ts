import "server-only";

import { Types, isValidObjectId } from "mongoose";

import { recordActivity } from "@/lib/activity";
import { loadCoachPay } from "@/lib/coachPayData";
import { dbConnect } from "@/lib/db";
import { resolvePayPeriod } from "@/lib/payPeriods";
import { dataUrlToBuffer, parsePng } from "@/lib/pdf/simplePdf";
import {
  ACADEMY_BILL_TO,
  amountInWordsINR,
  buildInvoiceLines,
  eligibleInvoiceMonths,
  groupInvoiceLines,
  incrementInvoiceNumber,
  invoiceDateFor,
  invoiceEmailSubject,
  invoiceFileName,
  isInvoiceMonthOpen,
  isMonthKey,
  manualLineSchema,
  payoutProfileSchema,
  type DraftGroup,
  type ManualLineInput,
  type MissingRate,
} from "@/lib/staffInvoice";
import type { PayPlanType } from "@/models/CoachPay";
import { Notification } from "@/models/Fee";
import { StaffInvoice, StaffPayoutProfile } from "@/models/StaffInvoice";
import { User } from "@/models/User";

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** A friendly error the page shows as-is, as opposed to a fault. */
export class StaffInvoiceError extends Error {}

// ---------------------------------------------------------------------------
// Invoice details (the payout profile).

// A 600x200 PNG; a photo kept with its paper background can reach a few hundred KB.
const MAX_SIGNATURE_BYTES = 400 * 1024;

/**
 * The signature must be a PNG the PDF writer can embed. The browser normalises
 * whatever was uploaded into one; this checks it again rather than trusting the
 * form, so a bad image is refused here and not discovered as a blank space on
 * an invoice.
 */
export function validateSignatureDataUrl(value: string) {
  const data = dataUrlToBuffer(value);
  if (!data || data.mime !== "image/png") throw new StaffInvoiceError("Upload your signature as an image (JPG or PNG).");
  if (data.buffer.length > MAX_SIGNATURE_BYTES) throw new StaffInvoiceError("That signature image is too large. Try a smaller picture.");
  const image = parsePng(data.buffer, "ImSign");
  if (!image || image.width > 1600 || image.height > 800) throw new StaffInvoiceError("That signature image could not be read. Try another picture.");
  return value;
}

export type PayoutProfileView = {
  fullName: string;
  address: string;
  pan: string;
  bankName: string;
  accountNumber: string;
  branchName: string;
  ifsc: string;
  accountType: "savings" | "current";
  nextInvoiceNumber: string;
  signature: string;
};

function profileView(doc: any): PayoutProfileView | null {
  if (!doc) return null;
  return {
    fullName: doc.fullName || "",
    address: doc.address || "",
    pan: doc.pan || "",
    bankName: doc.bankName || "",
    accountNumber: doc.accountNumber || "",
    branchName: doc.branchName || "",
    ifsc: doc.ifsc || "",
    accountType: doc.accountType === "current" ? "current" : "savings",
    nextInvoiceNumber: doc.nextInvoiceNumber || "",
    signature: doc.signature || "",
  };
}

export async function loadPayoutProfile(userId: string) {
  await dbConnect();
  return profileView(await StaffPayoutProfile.findOne({ user: userId }).lean());
}

export async function savePayoutProfile(userId: string, input: Record<string, unknown>, signature: string) {
  const parsed = payoutProfileSchema.safeParse(input);
  if (!parsed.success) throw new StaffInvoiceError(parsed.error.issues[0]?.message || "Check your details");
  await dbConnect();
  const existing: any = await StaffPayoutProfile.findOne({ user: userId }).select("signature").lean();
  const update: Record<string, unknown> = { ...parsed.data };
  if (signature) {
    update.signature = validateSignatureDataUrl(signature);
    update.signatureUpdatedAt = new Date();
  } else if (!existing?.signature) {
    throw new StaffInvoiceError("Upload your signature - it is printed on every invoice.");
  }
  await StaffPayoutProfile.updateOne(
    { user: new Types.ObjectId(userId) },
    { $set: update, $setOnInsert: { user: new Types.ObjectId(userId) } },
    { upsert: true }
  );
  await recordActivity({
    actor: userId,
    targetUser: userId,
    type: "staffInvoice.profile.saved",
    label: "Updated their invoice details",
    entityType: "StaffPayoutProfile",
    entityId: userId,
    metadata: { signatureChanged: Boolean(signature) },
  });
}

// ---------------------------------------------------------------------------
// Drafting and generating an invoice.

function payPeriodFor(month: string) {
  return resolvePayPeriod({ period: "month", month });
}

export type InvoiceHistoryRow = {
  id: string;
  month: string;
  invoiceNumber: string;
  total: number;
  status: string;
  generatedAt: string;
  paidAt: string;
  fileName: string;
};

export async function loadInvoiceHistory(userId: string): Promise<InvoiceHistoryRow[]> {
  await dbConnect();
  const invoices: any[] = await StaffInvoice.find({ staff: userId })
    .select("month invoiceNumber total status generatedAt paidAt billFrom.fullName")
    .sort({ month: -1 })
    .lean();
  return invoices.map((invoice) => ({
    id: idOf(invoice._id),
    month: invoice.month,
    invoiceNumber: invoice.invoiceNumber,
    total: Number(invoice.total || 0),
    status: invoice.status,
    generatedAt: invoice.generatedAt ? new Date(invoice.generatedAt).toISOString() : "",
    paidAt: invoice.paidAt ? new Date(invoice.paidAt).toISOString() : "",
    fileName: invoiceFileName(invoice.billFrom?.fullName || "", invoice.month),
  }));
}

export type InvoiceDraft = {
  month: string;
  groups: DraftGroup[];
  pending: { count: number; amount: number };
  /** Classes the academy has not priced yet; the invoice cannot be generated until they are. */
  missing: MissingRate[];
  manual: ManualLineInput[];
  invoiceNumber: string;
  existing: { id: string; status: string; invoiceNumber: string; generatedAt: string } | null;
};

export async function loadInvoiceDraft(userId: string, month: string): Promise<InvoiceDraft> {
  await dbConnect();
  const [profile, invoice, pay]: [any, any, Awaited<ReturnType<typeof loadCoachPay>>] = await Promise.all([
    StaffPayoutProfile.findOne({ user: userId }).select("nextInvoiceNumber").lean(),
    StaffInvoice.findOne({ staff: userId, month }).lean(),
    loadCoachPay(payPeriodFor(month), { coachId: userId }),
  ]);
  const { groups, pending, missing } = groupInvoiceLines(pay.events);
  return {
    month,
    groups,
    pending,
    missing,
    manual: (invoice?.lines || [])
      .filter((line: any) => line.group === "manual")
      .map((line: any) => ({ description: line.title, quantity: Number(line.quantity), rate: Number(line.rate) })),
    invoiceNumber: invoice?.invoiceNumber || profile?.nextInvoiceNumber || "",
    existing: invoice
      ? {
          id: idOf(invoice._id),
          status: invoice.status,
          invoiceNumber: invoice.invoiceNumber,
          generatedAt: invoice.generatedAt ? new Date(invoice.generatedAt).toISOString() : "",
        }
      : null,
  };
}

export type GenerateInvoiceInput = {
  month: string;
  invoiceNumber: string;
  /** Rupees. */
  manual: Array<{ description: string; quantity: number; rate: number }>;
};

/** "PIC-99994 (1 class on 01 Sep)" - for telling someone what is still unpriced. */
export function describeMissing(missing: MissingRate[]) {
  return missing
    .map((item) => {
      const dates = item.dates
        .slice(0, 3)
        .map((iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }))
        .join(", ");
      return `${item.title} (${item.count} class${item.count === 1 ? "" : "es"}${dates ? ` on ${dates}${item.count > 3 ? "..." : ""}` : ""})`;
    })
    .join("; ");
}

export async function generateStaffInvoice(userId: string, input: GenerateInvoiceInput) {
  const month = String(input.month || "");
  if (!isMonthKey(month)) throw new StaffInvoiceError("Choose a month.");
  if (!isInvoiceMonthOpen(month) || !eligibleInvoiceMonths().some((item) => item.month === month)) {
    throw new StaffInvoiceError("An invoice for that month can be raised from its last day.");
  }
  const invoiceNumber = String(input.invoiceNumber || "").trim();
  if (!invoiceNumber || invoiceNumber.length > 40) throw new StaffInvoiceError("Enter the invoice number.");

  await dbConnect();
  const [profile, user, existing]: any[] = await Promise.all([
    StaffPayoutProfile.findOne({ user: userId }).lean(),
    User.findById(userId).select("name email phone countryCode").lean(),
    StaffInvoice.findOne({ staff: userId, month }),
  ]);
  if (!profile) throw new StaffInvoiceError("Add your invoice details first.");
  if (!profile.signature) throw new StaffInvoiceError("Upload your signature first.");
  if (existing?.status === "paid") throw new StaffInvoiceError("This invoice has been paid, so it can no longer be changed.");
  const clash = await StaffInvoice.exists({ staff: userId, invoiceNumber, month: { $ne: month } });
  if (clash) throw new StaffInvoiceError(`You already used invoice number ${invoiceNumber} for another month.`);

  // Every amount comes from the academy's rates, recomputed here - nothing the
  // form sends can change what a class pays. A class the academy has not
  // priced yet holds the whole invoice back rather than going out at a guess.
  const pay = await loadCoachPay(payPeriodFor(month), { coachId: userId });
  const { groups, pending, missing } = groupInvoiceLines(pay.events);
  if (missing.length) {
    throw new StaffInvoiceError(`The academy has not set your rate for: ${describeMissing(missing)}. Please ask an admin to set it, then generate again.`);
  }

  const manual: ManualLineInput[] = [];
  for (const raw of input.manual || []) {
    if (!String(raw?.description || "").trim() && !Number(raw?.rate)) continue; // an empty row left in the form
    const parsed = manualLineSchema.safeParse({
      description: String(raw.description || ""),
      quantity: Number(raw.quantity),
      rate: Math.round(Number(raw.rate) * 100),
    });
    if (!parsed.success) throw new StaffInvoiceError(parsed.error.issues[0]?.message || "Check the extra items");
    manual.push(parsed.data);
  }
  if (manual.length > 30) throw new StaffInvoiceError("Keep extra items to 30 or fewer.");

  const { lines, total } = buildInvoiceLines(groups, manual);
  if (!lines.length) throw new StaffInvoiceError("There is nothing to invoice for this month.");

  const phone = user?.phone ? `${user.countryCode ? `${user.countryCode} ` : ""}${user.phone}` : "";
  const fields = {
    invoiceNumber,
    invoiceDate: invoiceDateFor(month),
    billFrom: {
      fullName: profile.fullName,
      address: profile.address,
      pan: profile.pan,
      email: user?.email || "",
      phone,
      bank: {
        accountHolder: profile.fullName,
        bankName: profile.bankName,
        accountNumber: profile.accountNumber,
        branchName: profile.branchName,
        ifsc: profile.ifsc,
        accountType: profile.accountType,
      },
    },
    billTo: ACADEMY_BILL_TO,
    signature: profile.signature,
    lines: lines.map((line) => ({
      group: line.group,
      kind: line.kind,
      classroom: isValidObjectId(line.classroomId) ? new Types.ObjectId(line.classroomId) : undefined,
      title: line.title,
      batchName: line.batchName,
      level: line.level,
      quantity: line.quantity,
      minutes: line.minutes,
      unit: line.unit,
      rate: line.rate,
      amount: line.amount,
      note: line.note,
      rateSource: line.rateSource,
      sessionIds: line.sessions.map((session) => session.sessionId),
    })),
    excludedPending: pending,
    total,
    totalInWords: amountInWordsINR(total),
    generatedAt: new Date(),
  };

  let saved: any;
  if (existing) {
    existing.set(fields);
    existing.generatedCount = Number(existing.generatedCount || 1) + 1;
    saved = await existing.save();
  } else {
    saved = await StaffInvoice.create({ staff: userId, month, status: "submitted", ...fields });
    await StaffPayoutProfile.updateOne({ user: userId }, { $set: { nextInvoiceNumber: incrementInvoiceNumber(invoiceNumber) } });
  }

  await recordActivity({
    actor: userId,
    targetUser: userId,
    type: existing ? "staffInvoice.regenerated" : "staffInvoice.generated",
    label: `${existing ? "Regenerated" : "Generated"} invoice ${invoiceNumber} for ${month}`,
    entityType: "StaffInvoice",
    entityId: idOf(saved._id),
    metadata: { month, total, otherItems: lines.filter((line) => line.rateSource === "manual").length },
  });

  return {
    id: idOf(saved._id),
    fileName: invoiceFileName(profile.fullName, month),
    subject: invoiceEmailSubject({ invoiceNumber, fullName: profile.fullName, month }),
    total,
  };
}

// ---------------------------------------------------------------------------
// The admin register.

export type RegisterRow = {
  id: string;
  staffId: string;
  staffName: string;
  invoiceNumber: string;
  total: number;
  manualTotal: number;
  classTotal: number;
  payrollTotal: number | null;
  planType: PayPlanType;
  status: string;
  generatedAt: string;
  paidAt: string;
  paymentReference: string;
};

export async function loadInvoiceRegister(month: string) {
  await dbConnect();
  const [invoices, pay]: [any[], Awaited<ReturnType<typeof loadCoachPay>>] = await Promise.all([
    StaffInvoice.find({ month }).populate("staff", "name username").sort({ generatedAt: -1 }).lean(),
    loadCoachPay(payPeriodFor(month)),
  ]);
  const payrollByCoach = new Map(pay.summary.rows.map((row) => [row.coachId, row]));
  // The plan each person was on this month, read off their pay lines (the
  // month's last line wins, matching the plan in force on the invoice date).
  const planByCoach = new Map<string, PayPlanType>();
  for (const event of [...pay.events].sort((a, b) => a.date.getTime() - b.date.getTime())) planByCoach.set(event.coachId, event.planType);

  const rows: RegisterRow[] = invoices.map((invoice) => {
    const staffId = idOf(invoice.staff);
    const manualTotal = (invoice.lines || []).filter((line: any) => line.group === "manual").reduce((sum: number, line: any) => sum + Number(line.amount || 0), 0);
    const payroll = payrollByCoach.get(staffId);
    return {
      id: idOf(invoice._id),
      staffId,
      staffName: invoice.billFrom?.fullName || invoice.staff?.name || invoice.staff?.username || "Staff",
      invoiceNumber: invoice.invoiceNumber,
      total: Number(invoice.total || 0),
      manualTotal,
      classTotal: Number(invoice.total || 0) - manualTotal,
      payrollTotal: payroll ? payroll.totalAmount : null,
      planType: planByCoach.get(staffId) || "per_class",
      status: invoice.status,
      generatedAt: invoice.generatedAt ? new Date(invoice.generatedAt).toISOString() : "",
      paidAt: invoice.paidAt ? new Date(invoice.paidAt).toISOString() : "",
      paymentReference: invoice.paymentReference || "",
    };
  });

  const invoiced = new Set(rows.map((row) => row.staffId));
  const notInvoiced = pay.summary.rows
    .filter((row) => !invoiced.has(row.coachId) && (row.totalAmount > 0 || row.unpriced > 0))
    .map((row) => ({ coachId: row.coachId, coachName: row.coachName, payrollTotal: row.totalAmount, unpriced: row.unpriced }));

  return { rows, notInvoiced };
}

export async function setInvoicePaid(input: { invoiceId: string; actorId: string; paid: boolean; reference?: string; paidOn?: string }) {
  if (!isValidObjectId(input.invoiceId)) throw new StaffInvoiceError("Unknown invoice");
  await dbConnect();
  const invoice: any = await StaffInvoice.findById(input.invoiceId);
  if (!invoice) throw new StaffInvoiceError("Unknown invoice");

  if (input.paid) {
    const paidAt = input.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) ? new Date(`${input.paidOn}T12:00:00+05:30`) : new Date();
    invoice.status = "paid";
    invoice.paidAt = paidAt;
    invoice.paidBy = new Types.ObjectId(input.actorId);
    invoice.paymentReference = String(input.reference || "").trim().slice(0, 120);
  } else {
    invoice.status = "submitted";
    invoice.paidAt = undefined;
    invoice.paidBy = undefined;
    invoice.paymentReference = "";
  }
  await invoice.save();

  await recordActivity({
    actor: input.actorId,
    targetUser: idOf(invoice.staff),
    type: input.paid ? "staffInvoice.paid" : "staffInvoice.reopened",
    label: `${input.paid ? "Marked paid" : "Reopened"} invoice ${invoice.invoiceNumber} for ${invoice.month}`,
    entityType: "StaffInvoice",
    entityId: idOf(invoice._id),
    metadata: { reference: invoice.paymentReference || "" },
  });
  await Notification.create({
    user: invoice.staff,
    type: "staff_invoice",
    title: input.paid ? "Your invoice has been paid" : "Your invoice was reopened",
    message: input.paid
      ? `Invoice ${invoice.invoiceNumber} for ${invoice.month} was marked paid${invoice.paymentReference ? ` (ref ${invoice.paymentReference})` : ""}.`
      : `Invoice ${invoice.invoiceNumber} for ${invoice.month} was reopened - you can regenerate it.`,
    metadata: { href: "/staff-invoices", invoiceId: idOf(invoice._id) },
  }).catch(() => undefined);
}

/** The invoice as the PDF needs it, or null if this viewer may not read it. */
export async function loadInvoiceForPdf(invoiceId: string, viewer: { userId: string; canViewAll: boolean }) {
  if (!isValidObjectId(invoiceId)) return null;
  await dbConnect();
  const invoice: any = await StaffInvoice.findById(invoiceId).lean();
  if (!invoice) return null;
  if (!viewer.canViewAll && idOf(invoice.staff) !== viewer.userId) return null;
  return invoice;
}
