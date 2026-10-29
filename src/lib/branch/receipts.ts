import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { academyDateKey } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { User } from "@/models/User";
import { BranchCounter, BranchFeeBill, BranchStudent } from "@/models/Branch";
import { BranchError } from "./errors";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { getBranchSettings } from "./settings";
import { billBalance, billDue, financialYear, monthLabel, receiptNumber, rupeesInWords } from "./rules";

/**
 * Numbered, non-GST receipts for branch fee payments. Numbers run per branch
 * and financial year and are claimed atomically, so two payments recorded at
 * once never share one.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const rupees = (paise: number) => `₹${Math.round((paise || 0) / 100).toLocaleString("en-IN")}`;
const MODE_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank transfer", other: "Earlier record" };

export async function nextReceiptNumber(branch: BranchKey, paidAt: Date) {
  const { receiptPrefix } = await getBranchSettings(branch);
  const year = financialYear(academyDateKey(paidAt));
  const counter: any = await BranchCounter.findOneAndUpdate(
    { key: `${branch}:receipt:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  ).lean();
  return receiptNumber(receiptPrefix, year, counter.seq);
}

export type ReceiptView = Awaited<ReturnType<typeof receiptFor>>;

/**
 * One payment as a receipt. Staff may open any of their branch's; a student
 * passes `studentId` and sees only their own.
 */
export async function receiptFor(branch: BranchKey, paymentId: string, studentId?: string) {
  await dbConnect();
  if (!Types.ObjectId.isValid(paymentId)) throw new BranchError("Receipt not found.", 404);
  const bill: any = await BranchFeeBill.findOne({ branch, "payments._id": paymentId, ...(studentId ? { student: studentId } : {}) }).lean();
  if (!bill) throw new BranchError("Receipt not found.", 404);
  const payment = (bill.payments || []).find((entry: any) => id(entry) === paymentId);
  if (!payment?.receiptNo) throw new BranchError("This payment was carried over from the old records and has no receipt.", 404);
  // One receipt can cover several months paid together (a fee plan, or arrears cleared at once).
  const bills: any[] = await BranchFeeBill.find({ branch, student: bill.student, "payments.receiptNo": payment.receiptNo }).sort({ month: 1 }).lean();
  const lines = bills.map((entry) => ({
    month: entry.month as string,
    amount: (entry.payments || []).filter((item: any) => item.receiptNo === payment.receiptNo).reduce((sum: number, item: any) => sum + item.amount, 0),
    charges: (entry.charges || []).map((charge: any) => charge.label as string),
  }));
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  const months = lines.map((line) => monthLabel(line.month));
  const charges = lines.flatMap((line) => line.charges);
  const student: any = await BranchStudent.findById(bill.student).select("name parentName regNo phone email user").lean();
  return {
    branchLabel: BRANCH_LABELS[branch],
    receiptNo: payment.receiptNo as string,
    paymentId,
    paidAt: payment.paidAt as Date,
    amount,
    amountInWords: rupeesInWords(amount),
    mode: MODE_LABEL[payment.mode] || payment.mode,
    reference: payment.reference || "",
    collectedByName: payment.collectedByName || "",
    month: bill.month as string,
    monthLabel: months.length > 2 ? `${months[0]} to ${months[months.length - 1]}` : months.join(" and "),
    towards: [`Chess classes, ${months.length > 2 ? `${months[0]} to ${months[months.length - 1]}` : months.join(" and ")}`, ...charges].join("; "),
    billDue: bills.reduce((sum, entry) => sum + billDue(entry), 0),
    paidOnBill: bills.reduce((sum, entry) => sum + (entry.paidAmount || 0), 0),
    balance: bills.reduce((sum, entry) => sum + billBalance(entry), 0),
    studentName: student?.name || "Student",
    parentName: student?.parentName || "",
    regNo: student?.regNo || "",
    phone: student?.phone || "",
    email: /\.invalid$/i.test(String(student?.email || "")) ? "" : student?.email || "",
    userId: student?.user ? id(student.user) : "",
  };
}

/** The message a family gets with a receipt, by email or pasted into WhatsApp. */
export function receiptMessage(receipt: ReceiptView, link: string) {
  return [
    `Received ${rupees(receipt.amount)} (${receipt.mode}) for ${receipt.studentName}'s ${receipt.monthLabel} fees.`,
    `Receipt no. ${receipt.receiptNo}.`,
    receipt.balance > 0 ? `Still due for ${receipt.monthLabel}: ${rupees(receipt.balance)}.` : `${receipt.monthLabel} is fully paid. Thank you!`,
    link ? `View or print the receipt (sign in first): ${link}` : "",
    `- Envision Chess Academy, ${receipt.branchLabel} centre`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function studentReceiptLink(paymentId: string, request?: Request) {
  const base = resolvePublicAppUrl(request);
  return base ? `${base}/bowbazar/me/receipts/${paymentId}` : "";
}

/** Emails the receipt to the family when they have a real address. Never throws. */
export async function emailReceipt(branch: BranchKey, paymentId: string, request?: Request) {
  try {
    const receipt = await receiptFor(branch, paymentId);
    const user: any = receipt.userId ? await User.findById(receipt.userId).select("email").lean() : null;
    const to = receipt.email || user?.email || "";
    if (!to || /\.invalid$/i.test(to)) return false;
    const link = studentReceiptLink(paymentId, request);
    const result = await sendAutomationEmail({
      to,
      subject: `Receipt ${receipt.receiptNo}: ${receipt.studentName}, ${receipt.monthLabel} - Envision Chess Academy ${receipt.branchLabel}`,
      message: [`Hello${receipt.parentName ? ` ${receipt.parentName}` : ""},`, "", receiptMessage(receipt, link)].join("\n"),
      actionUrl: link || undefined,
      actionLabel: link ? "View receipt" : undefined,
      metadata: { kind: "branch_fee_receipt", receiptNo: receipt.receiptNo },
    });
    return Boolean(result.delivered);
  } catch (error) {
    console.error("Branch receipt email failed", error);
    return false;
  }
}
