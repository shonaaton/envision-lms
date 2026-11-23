import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidObjectId } from "mongoose";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { UpiPayBox, branchUpiNote } from "@/components/bowbazar/UpiPayBox";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL, ACADEMY_PHONE_DISPLAY } from "@/lib/branding";
import { verifyBranchPaySignature } from "@/lib/branch/payLink";
import { billBalance, monthLabel } from "@/lib/branch/rules";
import { BRANCH_LABELS, type BranchKey } from "@/lib/branch/scope";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { BranchFeeBill, BranchStudent } from "@/models/Branch";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay chess class fees | Envision Chess Academy", robots: { index: false, follow: false } };

/**
 * The page a Bowbazar fee reminder links to (lib/branch/payLink.ts): a UPI QR
 * for the student's whole balance, read live so a payment the centre records,
 * a late fee or a waiver shows at once. It shows only the student's first
 * name, the months and the amount: the link may be forwarded.
 */
export default async function BranchPayPage({ params }: { params: { id: string; sig: string } }) {
  if (!isValidObjectId(params.id) || !verifyBranchPaySignature(params.id, params.sig)) notFound();
  await dbConnect();
  const student: any = await BranchStudent.findById(params.id).select("name regNo branch status").lean();
  if (!student) notFound();
  const bills: any[] = await BranchFeeBill.find({ student: student._id, status: { $in: ["unpaid", "partial"] } })
    .select("month amount discount planDiscount lateFee admissionFee charges paidAmount status")
    .sort({ month: 1 })
    .lean();
  const rows = bills.map((bill) => ({ month: bill.month as string, balance: billBalance(bill) })).filter((row) => row.balance > 0);
  const balance = rows.reduce((sum, row) => sum + row.balance, 0);
  const firstName = String(student.name || "").trim().split(/\s+/)[0] || "your child";
  const centre = BRANCH_LABELS[student.branch as BranchKey] || "Bowbazar";
  const months = rows.map((row) => monthLabel(row.month)).join(", ");
  const whatsApp = `https://wa.me/${ACADEMY_DEFAULTS.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Paid ${formatINR(balance)} by UPI for ${student.name} (${student.regNo || centre}), ${months}. UPI reference: `
  )}`;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-brand px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" className="h-8 w-auto" />
        </div>
        <div className="space-y-5 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{centre} centre · chess class fees</p>
            <p className="mt-1 text-sm text-slate-600">For {firstName}</p>
            {balance > 0 && <p className="mt-2 text-4xl font-black">{formatINR(balance)}</p>}
            {months && <p className="mt-1 text-sm text-slate-600">{months}</p>}
          </div>

          {balance <= 0 ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              Nothing is due right now. Thank you!
            </div>
          ) : (
            <>
              <UpiPayBox amount={balance} note={branchUpiNote(student.name, student.regNo)} />
              <a href={whatsApp} target="_blank" rel="noreferrer" className="btn-outline flex h-11 w-full items-center justify-center gap-2">
                <MessageCircle size={16} /> After paying, send us the UPI reference
              </a>
              <p className="-mt-3 text-center text-xs text-slate-500">
                WhatsApp {ACADEMY_PHONE_DISPLAY}. The centre marks the fees paid once it arrives. You can also pay at the centre by cash.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
