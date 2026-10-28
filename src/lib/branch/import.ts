import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { dbConnect } from "@/lib/db";
import { academyDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { readSpreadsheet, SpreadsheetFormatError } from "@/lib/sheetReader";
import { User, createUserWithUsername } from "@/models/User";
import { BranchFeeBill, BranchSlot, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { billStatus, monthKey, shiftMonth } from "./rules";
import { BranchError, listSlots } from "./service";
import { ImportFormatError, guessSlots, parseBranchImport, type ImportBill, type ImportStudent } from "./importParse";

export type ImportFiles = { students: { buffer: Buffer; name: string }; report: { buffer: Buffer; name: string } };
export type ImportOptions = {
  /** Old class name -> slot ids. */
  mapping: Record<string, string[]>;
  /** Registration number -> monthly fee in rupees, where the manager changed the guess. */
  fees: Record<string, number>;
  /** Raise this month's bill for current students the old report has not billed yet. */
  raiseCurrentMonth: boolean;
};

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");

function readPlan(files: ImportFiles) {
  try {
    return parseBranchImport(readSpreadsheet(files.students.buffer, files.students.name), readSpreadsheet(files.report.buffer, files.report.name));
  } catch (error) {
    if (error instanceof ImportFormatError || error instanceof SpreadsheetFormatError) throw new BranchError(error.message);
    throw error;
  }
}

/** Branch students the import would land on: by registration number, else an unnumbered record of the same name. */
async function existingMatches(branch: BranchKey, students: ImportStudent[]) {
  const records: any[] = await BranchStudent.find({ branch }).select("name regNo").lean();
  const byReg = new Map(records.filter((record) => record.regNo).map((record) => [record.regNo, record]));
  const byName = new Map(records.filter((record) => !record.regNo).map((record) => [record.name.trim().toLowerCase(), record]));
  const matches = new Map<string, { id: string; how: "regNo" | "name" }>();
  for (const student of students) {
    const hit = byReg.get(student.regNo);
    if (hit) matches.set(student.regNo, { id: id(hit), how: "regNo" });
    else {
      const named = byName.get(student.name.trim().toLowerCase());
      if (named) {
        matches.set(student.regNo, { id: id(named), how: "name" });
        byName.delete(student.name.trim().toLowerCase());
      }
    }
  }
  return matches;
}

/** Where a current student's automatic billing should pick up after the old report ends. */
function feeStartMonth(student: ImportStudent, raiseCurrentMonth: boolean) {
  const current = monthKey();
  if (student.lastMonth && student.lastMonth >= current) return shiftMonth(student.lastMonth, 1);
  return raiseCurrentMonth ? current : shiftMonth(current, 1);
}

export async function previewBranchImport(branch: BranchKey, files: ImportFiles) {
  await dbConnect();
  const plan = readPlan(files);
  const [slots, matches, billed] = await Promise.all([
    listSlots(branch, { includeInactive: false }),
    existingMatches(branch, plan.students),
    BranchFeeBill.countDocuments({ branch, source: "import" }),
  ]);
  const current = monthKey();
  return {
    currentMonth: current,
    alreadyImportedBills: billed,
    slots: slots.map(({ students, ...slot }) => ({ ...slot, seatedIds: students.map((student) => student.id) })),
    classes: plan.classes.map((entry) => ({ ...entry, guess: guessSlots(entry.name, slots) })),
    students: plan.students.map((student) => ({
      regNo: student.regNo,
      name: student.name,
      fatherName: student.fatherName,
      phone: student.phone,
      className: student.className,
      active: student.active,
      monthlyFee: student.monthlyFee,
      firstMonth: student.firstMonth,
      lastMonth: student.lastMonth,
      months: student.bills.length,
      paid: student.bills.reduce((sum, bill) => sum + Math.max(0, bill.paid), 0),
      reportOwed: student.reportOwed,
      listRemaining: student.listRemaining,
      existing: matches.get(student.regNo) || null,
      missingCurrentMonth: student.active && (!student.lastMonth || student.lastMonth < current),
    })),
    skipped: plan.skipped,
  };
}

function billDoc(branch: BranchKey, studentId: unknown, bill: ImportBill) {
  const amount = Math.max(0, Math.round(bill.total * 100));
  const paid = Math.max(0, Math.round(bill.paid * 100));
  const paidAt = bill.date ? academyDateTime(bill.date, "12:00") : academyDateTime(`${bill.month}-01`, "12:00");
  const payments = paid
    ? [{
        amount: paid,
        mode: "other",
        paidAt,
        reference: bill.receipt ? `Old report #${bill.receipt}` : "",
        note: "Carried over from the earlier fees report",
        collectedByName: "Earlier system",
      }]
    : [];
  let status: string = billStatus({ amount, paidAmount: paid });
  let waivedReason: string | undefined;
  if (bill.total < 0) {
    status = "waived";
    waivedReason = `The old report shows −₹${Math.abs(bill.total)} for this month (a credit or refund).`;
  } else if (!amount && !paid) {
    status = "waived";
    waivedReason = "No fee was charged in the old report.";
  }
  const doc: Record<string, unknown> = { branch, student: studentId, month: bill.month, amount, payments, paidAmount: paid, status, source: "import" };
  if (waivedReason) doc.waivedReason = waivedReason;
  if (paid > amount && amount) doc.note = `Paid ₹${(paid - amount) / 100} more than the fee in the old report.`;
  return doc;
}

let running = false;

/**
 * Creates the students and their fee history. Safe to run twice: students are
 * matched by registration number and existing ones are left as they are, and
 * a month that already has a bill keeps it.
 */
export async function commitBranchImport(branch: BranchKey, files: ImportFiles, options: ImportOptions, actorId: string) {
  if (running) throw new BranchError("An import is already running. Wait for it to finish.", 409);
  running = true;
  try {
    await dbConnect();
    const plan = readPlan(files);
    const [slotDocs, matches] = await Promise.all([BranchSlot.find({ branch }).select("_id").lean(), existingMatches(branch, plan.students)]);
    const validSlots = new Set((slotDocs as any[]).map(id));
    const result = { created: 0, linked: 0, kept: 0, billsCreated: 0, billsKept: 0 };

    for (const student of plan.students) {
      let studentId: string;
      const match = matches.get(student.regNo);
      if (match) {
        studentId = match.id;
        if (match.how === "name") {
          await BranchStudent.updateOne({ _id: studentId }, { $set: { regNo: student.regNo } });
          result.linked += 1;
        } else {
          result.kept += 1;
        }
      } else {
        const fee = Number.isFinite(options.fees?.[student.regNo]) ? Number(options.fees[student.regNo]) : student.monthlyFee;
        const password = randomBytes(6).toString("base64url").replace(/[-_]/g, "x");
        const slug = student.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "student";
        const user: any = await createUserWithUsername({
          name: student.name,
          email: `${slug}.${randomBytes(4).toString("hex")}@bowbazar.invalid`,
          phone: student.phone || undefined,
          countryCode: "+91",
          parentName: student.fatherName || undefined,
          city: "Kolkata",
          country: "India",
          role: "student",
          branch,
          accountStatus: "enrolled",
          isActive: student.active,
          ...(student.active ? {} : { deactivatedAt: new Date() }),
          passwordHash: await bcrypt.hash(password, 10),
          tempPassword: password,
          passwordChangedAt: new Date(),
          passwordChangeSource: "registration",
        });
        const slots = (options.mapping?.[student.className] || []).filter((slot) => validSlots.has(slot));
        const record: any = await BranchStudent.create({
          user: user._id,
          branch,
          regNo: student.regNo,
          name: student.name,
          fatherName: student.fatherName,
          parentName: student.fatherName,
          phone: student.phone,
          slots,
          monthlyFee: Math.max(0, Math.round(fee * 100)),
          feeStartMonth: student.active ? feeStartMonth(student, options.raiseCurrentMonth) : shiftMonth(student.lastMonth || monthKey(), 1),
          admissionDate: student.firstMonth ? academyDateTime(`${student.firstMonth}-01`) : new Date(),
          status: student.active ? "active" : "inactive",
          ...(student.active
            ? {}
            : {
                inactiveSince: academyDateTime(`${shiftMonth(student.lastMonth || monthKey(), 1)}-01`),
                inactiveReason: "Not on the student list when the portal started",
              }),
          notes: `Imported from the earlier sheets. Old class: ${student.className || "not given"}.`,
          createdBy: actorId,
        }).catch(async (error: unknown) => {
          await User.deleteOne({ _id: user._id });
          throw error;
        });
        studentId = id(record);
        result.created += 1;
      }

      if (student.bills.length) {
        const write = await BranchFeeBill.bulkWrite(
          student.bills.map((bill) => ({
            updateOne: {
              filter: { student: studentId, month: bill.month },
              update: { $setOnInsert: billDoc(branch, studentId, bill) },
              upsert: true,
            },
          })),
          { ordered: false }
        );
        result.billsCreated += write.upsertedCount;
        result.billsKept += student.bills.length - write.upsertedCount;
      }
    }

    void recordActivity({
      actor: actorId,
      type: "branch.import",
      label: `Imported ${branch} students and fees: ${result.created} new students, ${result.billsCreated} monthly bills`,
      entityType: "BranchStudent",
      metadata: { ...result, students: files.students.name, report: files.report.name },
    });
    return result;
  } finally {
    running = false;
  }
}
