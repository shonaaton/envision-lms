import { dbConnect } from "@/lib/db";
import { academyDateKey } from "@/lib/academyTime";
import { BranchFeeBill, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { getBranchSettings } from "./settings";
import { discountFor, isFeePlan, monthKey, monthsBetween, planDiscountFor, planPeriodEnd, proRataFee, shiftMonth, type FeePlan } from "./rules";

/*
 * Raising monthly bills. Its own file, free of Node built-ins, because the
 * scheduled fee jobs (reminders, late fees) raise the month's bills first.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");

/**
 * Raises any missing monthly bills up to `upTo`. A new bill takes the
 * student's standing discount; the first one also takes the admission fee
 * (once ever) and, when the branch charges part months, only the share of
 * the joining month left from the admission day.
 */
export async function ensureBranchBills(branch: BranchKey, upTo = monthKey()) {
  await dbConnect();
  const [students, settings]: [any[], Awaited<ReturnType<typeof getBranchSettings>>] = await Promise.all([
    BranchStudent.find({ branch, status: "active", monthlyFee: { $gt: 0 } })
      .select("monthlyFee feeStartMonth discount admissionFee admissionFeeBilledAt admissionDate feePlan")
      .lean(),
    getBranchSettings(branch),
  ]);
  const admissionFor: string[] = [];
  const operations = students.flatMap((student) => {
    const plan: FeePlan = isFeePlan(student.feePlan) ? student.feePlan : "monthly";
    // A plan family's whole current period is billed at once.
    const until = plan === "monthly" ? upTo : planPeriodEnd(student.feeStartMonth, upTo, plan);
    const planPercent = plan === "monthly" ? 0 : settings.planDiscounts[plan] || 0;
    return monthsBetween(student.feeStartMonth > shiftMonth(upTo, -24) ? student.feeStartMonth : shiftMonth(upTo, -24), until).map((month) => {
      const first = month === student.feeStartMonth;
      const joined = student.admissionDate ? academyDateKey(student.admissionDate) : "";
      const amount = first && settings.proRataFirstMonth && joined.slice(0, 7) === month ? proRataFee(student.monthlyFee, joined) : student.monthlyFee;
      const admissionFee = first && student.admissionFee > 0 && !student.admissionFeeBilledAt ? student.admissionFee : 0;
      if (admissionFee) admissionFor.push(id(student));
      return {
        updateOne: {
          filter: { student: student._id, month },
          update: {
            $setOnInsert: {
              branch,
              student: student._id,
              month,
              amount,
              discount: discountFor(amount, student.discount),
              planDiscount: Math.min(planDiscountFor(amount, planPercent), Math.max(0, amount - discountFor(amount, student.discount))),
              admissionFee,
              source: "auto",
              status: "unpaid",
              paidAmount: 0,
            },
          },
          upsert: true,
        },
      };
    });
  });
  if (operations.length) await BranchFeeBill.bulkWrite(operations, { ordered: false });
  // Whether or not the first bill was new this time, it now holds the admission fee (or never will).
  if (admissionFor.length) await BranchStudent.updateMany({ _id: { $in: admissionFor } }, { $set: { admissionFeeBilledAt: new Date() } });
  return operations.length;
}
