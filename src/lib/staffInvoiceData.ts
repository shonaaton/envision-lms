import "server-only";

import { Types, isValidObjectId } from "mongoose";

import { recordActivity } from "@/lib/activity";
import { loadCoachPay } from "@/lib/coachPayData";
import { upsertClassroomRateKindProposal, upsertCoachDemoRateProposal, upsertSessionProposal } from "@/lib/coachPayProposals";
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
} from "@/lib/staffInvoice";
import { Classroom } from "@/models/Classroom";
import { CoachPayProposal } from "@/models/CoachPay";
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

function unpricedKeyForLine(line: any) {
  if (line.rateSource !== "coach_entered") return "";
  if (line.group === "demo") return "demo:unpriced";
  if (line.group === "class") return `${line.kind}:${idOf(line.classroom)}:unpriced`;
  return "";
}

/**
 * Rates to suggest for classes with no academy price: what the person typed on
 * this month's invoice last time, else what they already proposed in Coach Pay
 * and nobody has answered yet. Paise.
 */
async function suggestedRates(userId: string, groups: DraftGroup[], invoice: any) {
  const suggestions: Record<string, number> = {};
  for (const line of invoice?.lines || []) {
    const key = unpricedKeyForLine(line);
    if (key) suggestions[key] = Number(line.rate || 0);
  }
  const unpriced = groups.filter((group) => group.needsRate && suggestions[group.key] === undefined);
  if (!unpriced.length) return suggestions;

  const proposals: any[] = await CoachPayProposal.find({ coach: userId, status: "pending" }).lean();
  for (const group of unpriced) {
    if (group.group === "demo") {
      const coachRate = proposals.find((item) => item.kind === "coach_rate" && item.demo?.amount !== null && item.demo?.amount !== undefined);
      if (coachRate && coachRate.demo?.unit !== "per_hour") suggestions[group.key] = Number(coachRate.demo.amount);
      continue;
    }
    const classroomRate = proposals.find((item) => item.kind === "classroom_rate" && idOf(item.classroom) === group.classroomId);
    const value = classroomRate?.[group.kind];
    if (value && value.amount !== null && value.amount !== undefined && value.unit !== "per_hour") {
      suggestions[group.key] = Number(value.amount);
      continue;
    }
    const sessionAmounts = new Set(
      proposals
        .filter((item) => item.kind === "session" && group.sessions.some((s) => s.sessionId === String(item.sessionId)) && item.unit !== "per_hour")
        .map((item) => Number(item.amount))
    );
    if (sessionAmounts.size === 1) suggestions[group.key] = Array.from(sessionAmounts)[0];
  }
  return suggestions;
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
  suggestedRates: Record<string, number>;
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
  const { groups, pending } = groupInvoiceLines(pay.events);
  return {
    month,
    groups,
    pending,
    suggestedRates: await suggestedRates(userId, groups, invoice),
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
  /** Group key -> rupees typed for a class that has no academy rate. */
  rates: Record<string, number>;
  /** Rupees. */
  manual: Array<{ description: string; quantity: number; rate: number }>;
};

/**
 * Files the pay proposals behind the rates a person typed on their invoice, so
 * the academy approves (or corrects) them in Coach Submissions. The invoice
 * uses the typed numbers straight away; payroll counts them only on approval.
 */
async function proposeEnteredRates(userId: string, month: string, invoiceNumber: string, groups: DraftGroup[], rates: Record<string, number>) {
  const note = `Entered on invoice ${invoiceNumber} for ${month}`;
  const ids: string[] = [];
  for (const group of groups) {
    // Classes the person priced, or classes with no rate on record that were
    // billed at the rate the rest of their batch carries.
    const amount = group.needsRate ? rates[group.key] : group.inferredSessions.length ? group.rate ?? undefined : undefined;
    if (amount === undefined) continue;
    const sessions = group.needsRate ? group.sessions : group.inferredSessions;
    const value = { amount, unit: "per_class" as const };

    if (group.group === "demo") {
      ids.push(idOf(await upsertCoachDemoRateProposal({ coachId: userId, demo: value, note })));
      continue;
    }
    if (group.kind === "regular" && isValidObjectId(group.classroomId)) {
      const teaches = await Classroom.exists({ _id: group.classroomId, $or: [{ coach: userId }, { instructor: userId }] });
      if (teaches) {
        ids.push(idOf(await upsertClassroomRateKindProposal({ coachId: userId, classroomId: group.classroomId, kind: "regular", value, note })));
        continue;
      }
    }
    // A substitution, or a regular class in a classroom they no longer hold:
    // priced one class at a time.
    for (const session of sessions) {
      if (!isValidObjectId(session.classroomId)) continue;
      ids.push(
        idOf(
          await upsertSessionProposal({
            coachId: userId,
            classroomId: session.classroomId,
            sessionId: session.sessionId,
            sessionDate: new Date(session.date),
            payKind: group.kind,
            amount,
            note,
          })
        )
      );
    }
  }
  return ids.filter(Boolean);
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

  // Recomputed here, never taken from the form: the person can only price the
  // classes that genuinely have no academy rate.
  const pay = await loadCoachPay(payPeriodFor(month), { coachId: userId });
  const { groups, pending } = groupInvoiceLines(pay.events);
  const rates: Record<string, number> = {};
  for (const group of groups) {
    if (!group.needsRate) continue;
    const rupees = Number(input.rates?.[group.key]);
    if (Number.isFinite(rupees) && rupees >= 0 && rupees <= 1_000_000) rates[group.key] = Math.round(rupees * 100);
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

  const { lines, missing, total } = buildInvoiceLines(groups, rates, manual);
  if (missing.length) {
    const titles = groups.filter((group) => missing.includes(group.key)).map((group) => group.title);
    throw new StaffInvoiceError(`Enter your rate for: ${titles.join(", ")}.`);
  }
  if (!lines.length) throw new StaffInvoiceError("There is nothing to invoice for this month. Add an item below.");

  const proposalIds = await proposeEnteredRates(userId, month, invoiceNumber, groups, rates);

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
      quantity: line.quantity,
      minutes: line.minutes,
      rate: line.rate,
      amount: line.amount,
      rateSource: line.rateSource,
      sessionIds: line.sessions.map((session) => session.sessionId),
    })),
    excludedPending: pending,
    total,
    totalInWords: amountInWordsINR(total),
    proposals: proposalIds.map((id) => new Types.ObjectId(id)),
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
    metadata: { month, total, coachEnteredLines: lines.filter((line) => line.rateSource === "coach_entered").length },
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
  coachEnteredLines: number;
  pendingProposals: number;
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
  const proposalIds = invoices.flatMap((invoice) => (invoice.proposals || []).map(idOf));
  const pendingIds = new Set(
    proposalIds.length
      ? (await CoachPayProposal.find({ _id: { $in: proposalIds }, status: "pending" }).select("_id").lean()).map((item: any) => idOf(item._id))
      : []
  );

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
      coachEnteredLines: (invoice.lines || []).filter((line: any) => line.rateSource === "coach_entered").length,
      pendingProposals: (invoice.proposals || []).filter((id: any) => pendingIds.has(idOf(id))).length,
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
