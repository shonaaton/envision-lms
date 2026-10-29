import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { academyDateKey, academyDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { User, createUserWithUsername } from "@/models/User";
import { BranchAdmission, BranchFeeBill, BranchSlot, BranchSlotChange, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import {
  DEFAULT_SLOTS,
  WEEK_ORDER,
  billBalance,
  billDue,
  isFeePlan,
  billStatus,
  isMonthKey,
  isTime,
  monthKey,
  overfullSlots,
  rupeesToPaise,
  shiftMonth,
  slotLabel,
} from "./rules";

import { BranchError } from "./errors";
import { getBranchSettings } from "./settings";
import { absentStreaks, alertFreedSeats } from "./alerts";
import { nextReceiptNumber } from "./receipts";
import { ensureBranchBills } from "./bills";

export { ensureBranchBills };

export { BranchError };

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

function tempPassword() {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "x");
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/** Active students seated in each slot, keyed by slot id. */
async function slotOccupancy(branch: BranchKey) {
  const students: any[] = await BranchStudent.find({ branch, status: "active" }).select("name slots").lean();
  const occupied = new Map<string, string[]>();
  const names = new Map<string, { id: string; name: string }[]>();
  for (const student of students) {
    for (const slot of student.slots || []) {
      const key = id(slot);
      occupied.set(key, [...(occupied.get(key) || []), id(student)]);
      names.set(key, [...(names.get(key) || []), { id: id(student), name: student.name }]);
    }
  }
  return { occupied, names };
}

function serializeSlot(slot: any, seated: { id: string; name: string }[] = []) {
  return {
    id: id(slot),
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slotLabel(slot),
    mode: slot.mode,
    capacity: slot.capacity,
    meetingUrl: slot.meetingUrl || "",
    isActive: slot.isActive !== false,
    filled: seated.length,
    free: Math.max(0, slot.capacity - seated.length),
    students: seated.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const sortSlots = (a: any, b: any) =>
  WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime);

export async function listSlots(branch: BranchKey, { includeInactive = true } = {}) {
  await dbConnect();
  const [slots, { names }] = await Promise.all([
    BranchSlot.find({ branch, ...(includeInactive ? {} : { isActive: true }) }).lean(),
    slotOccupancy(branch),
  ]);
  return (slots as any[]).sort(sortSlots).map((slot) => serializeSlot(slot, names.get(id(slot)) || []));
}

export async function saveSlot(branch: BranchKey, input: any, slotId?: string) {
  await dbConnect();
  const dayOfWeek = Number(input?.dayOfWeek);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new BranchError("Choose a day.");
  if (!isTime(input?.startTime) || !isTime(input?.endTime)) throw new BranchError("Enter start and end times.");
  if (input.endTime <= input.startTime) throw new BranchError("The slot must end after it starts.");
  const capacity = Math.round(Number(input?.capacity ?? 7));
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 50) throw new BranchError("Capacity must be between 1 and 50.");
  const mode = input?.mode === "online" ? "online" : "offline";
  const doc = {
    dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    mode,
    capacity,
    meetingUrl: text(input?.meetingUrl, 500),
    isActive: input?.isActive !== false,
  };
  if (slotId) {
    if (!isObjectId(slotId)) throw new BranchError("Slot not found.", 404);
    const { occupied } = await slotOccupancy(branch);
    const seated = (occupied.get(slotId) || []).length;
    if (capacity < seated) throw new BranchError(`${seated} students sit in this slot; capacity cannot go below that.`);
    if (!doc.isActive && seated) throw new BranchError("Move the students out of this slot before closing it.");
    const updated = await BranchSlot.findOneAndUpdate({ _id: slotId, branch }, { $set: doc }, { new: true }).catch(duplicateSlot);
    if (!updated) throw new BranchError("Slot not found.", 404);
    // More seats may mean room for someone on the waitlist.
    if (capacity > seated) void alertFreedSeats(branch, [slotId]);
    return updated;
  }
  return BranchSlot.create({ branch, ...doc }).catch(duplicateSlot);
}

/** Creates the centre's timetable (rules.ts DEFAULT_SLOTS); slots that exist are left alone. */
export async function seedDefaultSlots(branch: BranchKey) {
  await dbConnect();
  const result = await BranchSlot.bulkWrite(
    DEFAULT_SLOTS.map((slot) => ({
      updateOne: {
        filter: { branch, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime },
        update: { $setOnInsert: { branch, ...slot, capacity: 7, isActive: true } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return result.upsertedCount;
}

function duplicateSlot(error: any): never {
  if (error?.code === 11000) throw new BranchError("There is already a slot on that day at that time.", 409);
  throw error;
}

/** Throws unless every slot exists in this branch, is open, and has a seat for this student. */
export async function assertSeats(branch: BranchKey, slotIds: string[], studentId: string | null) {
  if (slotIds.some((slot) => !isObjectId(slot))) throw new BranchError("Choose valid slots.");
  const slots: any[] = await BranchSlot.find({ _id: { $in: slotIds }, branch, isActive: true }).lean();
  if (slots.length !== new Set(slotIds).size) throw new BranchError("One of the chosen slots is closed or does not exist.");
  const { occupied } = await slotOccupancy(branch);
  const full = overfullSlots(slots.map((slot) => ({ id: id(slot), capacity: slot.capacity })), occupied, studentId);
  if (full.length) {
    const labels = slots.filter((slot) => full.some((entry) => entry.id === id(slot))).map(slotLabel);
    throw new BranchError(`No seat left in ${labels.join(", ")}.`, 409);
  }
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

/**
 * The standing discount from a form: `discountKind` none/percent/flat with
 * `discountValue` (a percentage, or rupees). Without `discountKind` the
 * student's current discount is kept; "none" clears it (null).
 */
function discountField(input: any) {
  if (input?.discountKind === undefined) return input?.discount?.kind ? input.discount : undefined;
  const kind = input.discountKind;
  if (!kind || kind === "none") return null;
  const reason = text(input?.discountReason, 120);
  if (kind === "percent") {
    const value = Number(input?.discountValue);
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new BranchError("Enter the discount as a whole percentage from 1 to 100.");
    return { kind, value, reason };
  }
  if (kind === "flat") {
    const value = rupeesToPaise(input?.discountValue);
    if (!value) throw new BranchError("Enter the discount in rupees.");
    return { kind, value, reason };
  }
  throw new BranchError("Choose a percentage or a fixed amount for the discount.");
}

function studentFields(input: any) {
  const name = text(input?.name, 120);
  if (!name) throw new BranchError("Enter the student's name.");
  const phone = text(input?.phone, 20).replace(/[^\d+]/g, "");
  if (phone && phone.replace(/\D/g, "").length < 10) throw new BranchError("Enter a 10-digit phone number.");
  const email = text(input?.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BranchError("Enter a valid email address.");
  const monthlyFee = rupeesToPaise(input?.monthlyFee ?? 0);
  if (monthlyFee === null) throw new BranchError("Enter the monthly fee in rupees.");
  const slots = Array.isArray(input?.slots) ? [...new Set(input.slots.map(String))] as string[] : [];
  const dob = input?.dateOfBirth ? new Date(input.dateOfBirth) : null;
  return {
    name,
    phone,
    email,
    monthlyFee,
    slots,
    fatherName: text(input?.fatherName, 120),
    motherName: text(input?.motherName, 120),
    parentName: text(input?.parentName, 120) || text(input?.fatherName, 120) || text(input?.motherName, 120),
    address: text(input?.address, 500),
    school: text(input?.school, 200),
    dateOfBirth: dob && !Number.isNaN(dob.getTime()) ? dob : undefined,
    notes: text(input?.notes, 1000),
    feePlan: isFeePlan(input?.feePlan) ? input.feePlan : "monthly",
    discount: discountField(input),
  };
}

/**
 * The login email. Siblings usually share a parent's address, and `User.email`
 * is unique, so the second child gets a reserved placeholder (`.invalid` never
 * resolves) and signs in with their user ID instead.
 */
async function loginEmailFor(email: string, name: string) {
  if (email && !(await User.exists({ email }).setOptions({ allBranches: true }))) return email;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "student";
  return `${slug}.${randomBytes(4).toString("hex")}@bowbazar.invalid`;
}

export async function createStudent(branch: BranchKey, input: any, actorId: string) {
  await dbConnect();
  const { discount, ...fields } = studentFields(input);
  // The admission fee defaults to the branch's setting; the form can change it for one student.
  const admissionFee =
    input?.admissionFee === undefined || input?.admissionFee === "" ? (await getBranchSettings(branch)).admissionFee : rupeesToPaise(input.admissionFee);
  if (admissionFee === null) throw new BranchError("Enter the admission fee in rupees.");
  if (!fields.phone) throw new BranchError("Enter the parent's phone number.");
  await assertSeats(branch, fields.slots, null);
  const password = tempPassword();
  const user: any = await createUserWithUsername({
    name: fields.name,
    email: await loginEmailFor(fields.email, fields.name),
    phone: fields.phone.replace(/^\+?91(?=\d{10}$)/, ""),
    countryCode: "+91",
    parentName: fields.parentName,
    parentEmail: fields.email || undefined,
    city: "Kolkata",
    country: "India",
    role: "student",
    branch,
    accountStatus: "enrolled",
    passwordHash: await bcrypt.hash(password, 10),
    tempPassword: password,
    passwordChangedAt: new Date(),
    passwordChangeSource: "registration",
  });
  const admissionDate = input?.admissionDate ? new Date(input.admissionDate) : new Date();
  const startMonth = isMonthKey(input?.feeStartMonth) ? input.feeStartMonth : monthKey(admissionDate);
  let student: any;
  try {
    student = await BranchStudent.create({
      ...fields,
      ...(discount ? { discount } : {}),
      admissionFee,
      user: user._id,
      branch,
      admissionDate: Number.isNaN(admissionDate.getTime()) ? new Date() : admissionDate,
      feeStartMonth: startMonth,
      createdBy: actorId,
    });
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
  void recordActivity({
    actor: actorId,
    targetUser: id(user),
    type: "branch.student_created",
    label: `Added ${fields.name} to the ${branch} branch`,
    entityType: "BranchStudent",
    entityId: id(student),
  });
  return { student, user, username: user.username as string, password };
}

export async function updateStudent(branch: BranchKey, studentId: string, input: any) {
  await dbConnect();
  const student: any = await findStudent(branch, studentId);
  const { discount, ...fields } = studentFields({ ...student, monthlyFee: (student.monthlyFee || 0) / 100, ...input });
  if (student.status === "active") await assertSeats(branch, fields.slots, studentId);
  await BranchStudent.updateOne(
    { _id: studentId },
    discount === null ? { $set: fields, $unset: { discount: 1 } } : { $set: { ...fields, ...(discount ? { discount } : {}) } }
  );
  const leftSlots = (student.slots || []).map(id).filter((slot: string) => !fields.slots.includes(slot));
  if (student.status === "active" && leftSlots.length) void alertFreedSeats(branch, leftSlots);
  await User.updateOne(
    { _id: student.user },
    { $set: { name: fields.name, phone: fields.phone.replace(/^\+?91(?=\d{10}$)/, ""), parentName: fields.parentName, parentEmail: fields.email || undefined } }
  );
}

export async function setStudentStatus(branch: BranchKey, studentId: string, input: any, actorId: string) {
  await dbConnect();
  const student: any = await findStudent(branch, studentId);
  const active = input?.status === "active";
  if (active === (student.status === "active")) return;
  if (active) {
    await assertSeats(branch, (student.slots || []).map(id), studentId);
    // Billing restarts from the month they come back, not from where it stopped.
    await BranchStudent.updateOne(
      { _id: studentId },
      { $set: { status: "active", feeStartMonth: monthKey() }, $unset: { inactiveSince: 1, inactiveReason: 1 } }
    );
    await User.updateOne({ _id: student.user }, { $set: { isActive: true }, $unset: { deactivatedAt: 1 } });
  } else {
    const reason = text(input?.reason, 300);
    if (!reason) throw new BranchError("Say why the student is leaving.");
    const since = input?.since ? new Date(input.since) : new Date();
    await BranchStudent.updateOne(
      { _id: studentId },
      { $set: { status: "inactive", inactiveReason: reason, inactiveSince: Number.isNaN(since.getTime()) ? new Date() : since } }
    );
    await User.updateOne({ _id: student.user }, { $set: { isActive: false, deactivatedAt: new Date() } });
    void alertFreedSeats(branch, student.slots || []);
  }
  void recordActivity({
    actor: actorId,
    targetUser: id(student.user),
    type: active ? "branch.student_reactivated" : "branch.student_inactivated",
    label: `${active ? "Reactivated" : "Marked inactive"}: ${student.name}`,
    entityType: "BranchStudent",
    entityId: studentId,
  });
}

/** A fresh password for a student who lost theirs; shown once to the manager. */
export async function resetStudentPassword(branch: BranchKey, studentId: string) {
  await dbConnect();
  const student: any = await findStudent(branch, studentId);
  const password = tempPassword();
  await User.updateOne(
    { _id: student.user },
    {
      $set: { passwordHash: await bcrypt.hash(password, 10), tempPassword: password, passwordChangedAt: new Date(), passwordChangeSource: "admin_reset", failedLoginAttempts: 0 },
      // A stuck family is the usual reason for a reset; a lockout left in place makes the new password look wrong too.
      $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, lastFailedLoginAt: 1, loginLockedUntil: 1 },
    }
  );
  const user: any = await User.findById(student.user).select("username").lean();
  return { username: user?.username as string, password };
}

async function findStudent(branch: BranchKey, studentId: string) {
  if (!isObjectId(studentId)) throw new BranchError("Student not found.", 404);
  const student = await BranchStudent.findOne({ _id: studentId, branch }).lean();
  if (!student) throw new BranchError("Student not found.", 404);
  return student;
}

export async function listStudents(branch: BranchKey) {
  await dbConnect();
  const [students, slots, owed] = await Promise.all([
    BranchStudent.find({ branch }).sort({ name: 1 }).lean(),
    BranchSlot.find({ branch }).lean(),
    BranchFeeBill.find({ branch, status: { $in: ["unpaid", "partial"] } })
      .select("student amount discount planDiscount lateFee admissionFee charges paidAmount status month")
      .lean(),
  ]);
  const users: any[] = await User.find({ _id: { $in: (students as any[]).map((s) => s.user) } })
    .select("username avatar lastLoginAt")
    .lean();
  const userById = new Map(users.map((user) => [id(user), user]));
  const slotById = new Map((slots as any[]).map((slot) => [id(slot), slot]));
  const dues = new Map<string, { balance: number; months: string[] }>();
  for (const bill of owed as any[]) {
    const entry = dues.get(id(bill.student)) || { balance: 0, months: [] };
    entry.balance += billBalance(bill);
    entry.months.push(bill.month);
    dues.set(id(bill.student), entry);
  }
  return (students as any[]).map((student) => {
    const user = userById.get(id(student.user));
    const due = dues.get(id(student));
    return {
      id: id(student),
      name: student.name,
      userId: id(student.user),
      regNo: student.regNo || "",
      username: user?.username || "",
      avatar: user?.avatar || "",
      lastLoginAt: user?.lastLoginAt || null,
      status: student.status,
      inactiveSince: student.inactiveSince || null,
      inactiveReason: student.inactiveReason || "",
      phone: student.phone || "",
      email: student.email || "",
      parentName: student.parentName || "",
      fatherName: student.fatherName || "",
      motherName: student.motherName || "",
      address: student.address || "",
      school: student.school || "",
      dateOfBirth: student.dateOfBirth || null,
      notes: student.notes || "",
      admissionId: student.admission ? id(student.admission) : "",
      discount: student.discount?.kind ? { kind: student.discount.kind, value: student.discount.value, reason: student.discount.reason || "" } : null,
      admissionFee: student.admissionFee || 0,
      feePlan: student.feePlan || "monthly",
      monthlyFee: student.monthlyFee || 0,
      feeStartMonth: student.feeStartMonth,
      admissionDate: student.admissionDate,
      slots: (student.slots || [])
        .map((slot: any) => slotById.get(id(slot)))
        .filter(Boolean)
        .sort(sortSlots)
        .map((slot: any) => ({ id: id(slot), label: slotLabel(slot), mode: slot.mode })),
      pendingAmount: due?.balance || 0,
      pendingMonths: (due?.months || []).sort(),
    };
  });
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

/**
 * Raise every bill an active student is owed, up to and including `upTo`.
 * Idempotent: the unique (student, month) index and `$setOnInsert` mean a bill
 * that exists - paid, waived or edited by hand - is never touched again. Runs
 * whenever the fees screens open, so a month nobody looked at is still billed.
 */

function serializeBill(bill: any, student?: any, slotById?: Map<string, any>) {
  return {
    id: id(bill),
    month: bill.month,
    amount: bill.amount,
    discount: bill.discount || 0,
    lateFee: bill.lateFee || 0,
    admissionFee: bill.admissionFee || 0,
    planDiscount: bill.planDiscount || 0,
    charges: (bill.charges || []).map((charge: any) => ({
      id: id(charge),
      label: charge.label,
      kind: charge.kind || "other",
      amount: charge.amount,
      note: charge.note || "",
      addedByName: charge.addedByName || "",
    })),
    due: billDue(bill),
    paidAmount: bill.paidAmount || 0,
    balance: billBalance(bill),
    status: bill.status,
    waivedReason: bill.waivedReason || "",
    note: bill.note || "",
    source: bill.source,
    payments: (bill.payments || []).map((payment: any) => ({
      id: id(payment),
      amount: payment.amount,
      mode: payment.mode,
      paidAt: payment.paidAt,
      reference: payment.reference || "",
      note: payment.note || "",
      collectedByName: payment.collectedByName || "",
      receiptNo: payment.receiptNo || "",
    })),
    student: student
      ? {
          id: id(student),
          name: student.name,
          phone: student.phone || "",
          parentName: student.parentName || "",
          status: student.status,
          slots: (student.slots || [])
            .map((slot: any) => slotById?.get(id(slot)))
            .filter(Boolean)
            .sort(sortSlots)
            .map((slot: any) => ({ id: id(slot), label: slotLabel(slot) })),
        }
      : null,
  };
}

async function studentsAndSlots(branch: BranchKey) {
  const [students, slots] = await Promise.all([BranchStudent.find({ branch }).lean(), BranchSlot.find({ branch }).lean()]);
  return {
    studentById: new Map((students as any[]).map((student) => [id(student), student])),
    slotById: new Map((slots as any[]).map((slot) => [id(slot), slot])),
  };
}

/** Everything billed for `month`, and the money that came in during it. */
export async function monthReport(branch: BranchKey, month: string) {
  if (!isMonthKey(month)) throw new BranchError("Choose a month.");
  await dbConnect();
  if (month <= monthKey()) await ensureBranchBills(branch);
  const { studentById, slotById } = await studentsAndSlots(branch);
  const start = academyDateTime(`${month}-01`);
  const end = academyDateTime(`${shiftMonth(month, 1)}-01`);
  const [bills, collectedIn] = await Promise.all([
    BranchFeeBill.find({ branch, month }).lean(),
    // Payments made during the month, whatever month they settled - the cash
    // the centre actually took in.
    BranchFeeBill.aggregate([
      { $match: { branch, payments: { $elemMatch: { paidAt: { $gte: start, $lt: end } } } } },
      { $unwind: "$payments" },
      { $match: { "payments.paidAt": { $gte: start, $lt: end } } },
      { $group: { _id: "$payments.mode", amount: { $sum: "$payments.amount" } } },
    ]),
  ]);
  const rows = (bills as any[])
    .map((bill) => serializeBill(bill, studentById.get(id(bill.student)), slotById))
    .sort((a, b) => (a.student?.name || "").localeCompare(b.student?.name || ""));
  const received = { cash: 0, upi: 0, bank: 0, other: 0 };
  for (const group of collectedIn as any[]) {
    if (group._id in received) received[group._id as keyof typeof received] = group.amount;
  }
  return {
    month,
    bills: rows,
    totals: {
      billed: rows.reduce((sum, row) => sum + (row.status === "waived" ? 0 : row.due), 0),
      collected: rows.reduce((sum, row) => sum + row.paidAmount, 0),
      pending: rows.reduce((sum, row) => sum + row.balance, 0),
      paidCount: rows.filter((row) => row.status === "paid" || row.status === "waived").length,
      pendingCount: rows.filter((row) => row.balance > 0).length,
      received,
      receivedTotal: received.cash + received.upi + received.bank + received.other,
    },
  };
}

/** Every bill still owed, oldest month first, grouped by student. */
export async function pendingByStudent(branch: BranchKey) {
  await dbConnect();
  await ensureBranchBills(branch);
  const { studentById, slotById } = await studentsAndSlots(branch);
  const bills: any[] = await BranchFeeBill.find({ branch, status: { $in: ["unpaid", "partial"] } }).sort({ month: 1 }).lean();
  const groups = new Map<string, { student: any; bills: any[]; balance: number }>();
  for (const bill of bills) {
    const row = serializeBill(bill, studentById.get(id(bill.student)), slotById);
    if (row.balance <= 0) continue;
    const key = id(bill.student);
    const group = groups.get(key) || { student: row.student, bills: [], balance: 0 };
    group.bills.push(row);
    group.balance += row.balance;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.bills.length - a.bills.length || b.balance - a.balance);
}

async function findBill(branch: BranchKey, billId: string) {
  if (!isObjectId(billId)) throw new BranchError("Bill not found.", 404);
  const bill: any = await BranchFeeBill.findOne({ _id: billId, branch });
  if (!bill) throw new BranchError("Bill not found.", 404);
  return bill;
}

function settle(bill: any) {
  bill.paidAmount = (bill.payments || []).reduce((sum: number, payment: any) => sum + payment.amount, 0);
  bill.status = billStatus({ ...bill.toObject(), status: bill.status === "waived" ? "waived" : undefined });
}

export async function recordPayment(branch: BranchKey, billId: string, input: any, actor: { id: string; name?: string }) {
  await dbConnect();
  const bill = await findBill(branch, billId);
  if (bill.status === "waived") throw new BranchError("This bill was waived.");
  const amount = rupeesToPaise(input?.amount);
  if (!amount) throw new BranchError("Enter the amount received.");
  if (amount > billBalance(bill)) throw new BranchError("That is more than the balance on this bill.");
  const mode = ["cash", "upi", "bank"].includes(input?.mode) ? input.mode : null;
  if (!mode) throw new BranchError("Choose cash, UPI or bank transfer.");
  const paidAt = input?.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 60_000) throw new BranchError("Enter a valid payment date.");
  bill.payments.push({
    amount,
    mode,
    paidAt,
    reference: text(input?.reference, 120),
    note: text(input?.note, 300),
    collectedBy: actor.id,
    collectedByName: actor.name || "",
    receiptNo: await nextReceiptNumber(branch, paidAt),
  });
  settle(bill);
  await bill.save();
  const saved = bill.toObject();
  const payment = saved.payments[saved.payments.length - 1];
  return { ...serializeBill(saved), receipt: { paymentId: id(payment), receiptNo: payment.receiptNo as string } };
}

/**
 * One payment for several of a family's bills - a plan paid ahead, or arrears
 * cleared at once. Each bill is paid in full, oldest first, and all of them
 * share one receipt number.
 */
export async function recordGroupPayment(branch: BranchKey, studentId: string, input: any, actor: { id: string; name?: string }) {
  await dbConnect();
  const student: any = await findStudent(branch, studentId);
  const billIds: string[] = (Array.isArray(input?.billIds) ? input.billIds : []).filter(isObjectId);
  if (!billIds.length) throw new BranchError("Pick the months being paid.");
  const bills: any[] = await BranchFeeBill.find({ _id: { $in: billIds }, branch, student: student._id }).sort({ month: 1 });
  if (bills.length !== new Set(billIds).size) throw new BranchError("One of those bills was not found.", 404);
  if (bills.some((bill) => bill.status === "waived" || billBalance(bill) <= 0)) throw new BranchError("One of those months is already settled.");
  const mode = ["cash", "upi", "bank"].includes(input?.mode) ? input.mode : null;
  if (!mode) throw new BranchError("Choose cash, UPI or bank transfer.");
  const paidAt = input?.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 60_000) throw new BranchError("Enter a valid payment date.");
  const receiptNo = await nextReceiptNumber(branch, paidAt);
  let firstPaymentId = "";
  for (const bill of bills) {
    bill.payments.push({
      amount: billBalance(bill),
      mode,
      paidAt,
      reference: text(input?.reference, 120),
      note: text(input?.note, 300),
      collectedBy: actor.id,
      collectedByName: actor.name || "",
      receiptNo,
    });
    settle(bill);
    await bill.save();
    if (!firstPaymentId) firstPaymentId = id(bill.payments[bill.payments.length - 1]);
  }
  return { receipt: { paymentId: firstPaymentId, receiptNo }, months: bills.map((bill) => bill.month) };
}

const CHARGE_KINDS = ["tournament", "material", "exam", "event", "other"];

/**
 * Adds a one-off charge (tournament entry, books, a chess set) to each chosen
 * student's bill for a month, raising that bill if it isn't there yet.
 */
export async function addCharges(branch: BranchKey, input: any, actor: { id: string; name?: string }) {
  await dbConnect();
  const label = text(input?.label, 120);
  if (!label) throw new BranchError("Say what the charge is for.");
  const amount = rupeesToPaise(input?.amount);
  if (!amount) throw new BranchError("Enter the amount in rupees.");
  const month = isMonthKey(input?.month) ? input.month : monthKey();
  const kind = CHARGE_KINDS.includes(input?.kind) ? input.kind : "other";
  const studentIds: string[] = (Array.isArray(input?.studentIds) ? input.studentIds : []).filter(isObjectId);
  if (!studentIds.length) throw new BranchError("Pick at least one student.");
  const students: any[] = await BranchStudent.find({ _id: { $in: studentIds }, branch }).select("_id").lean();
  if (students.length !== new Set(studentIds).size) throw new BranchError("One of those students was not found.", 404);
  const charge = { label, kind, amount, note: text(input?.note, 300), addedBy: actor.id, addedByName: actor.name || "", addedAt: new Date() };
  for (const student of students) {
    // A student with no fee that month (left, or a fee of 0) gets a bill holding just the charge.
    await BranchFeeBill.updateOne(
      { student: student._id, month },
      { $setOnInsert: { branch, student: student._id, month, amount: 0, source: "manual", status: "unpaid", paidAmount: 0 }, $push: { charges: charge } },
      { upsert: true }
    );
    const bill = await BranchFeeBill.findOne({ student: student._id, month });
    if (bill && bill.status !== "waived") {
      settle(bill);
      await bill.save();
    }
  }
  return { added: students.length, month };
}

/** Takes a charge off a bill; refused when what's left would be less than what's paid. */
export async function removeCharge(branch: BranchKey, billId: string, chargeId: string) {
  await dbConnect();
  const bill = await findBill(branch, billId);
  const charge = bill.charges.id(chargeId);
  if (!charge) throw new BranchError("Charge not found.", 404);
  charge.deleteOne();
  if (billDue(bill) < (bill.paidAmount || 0)) throw new BranchError("More has been paid than this bill would be without the charge. Remove the payment first.");
  settle(bill);
  await bill.save();
  return serializeBill(bill.toObject());
}

/** Undo a payment entered by mistake. */
export async function removePayment(branch: BranchKey, billId: string, paymentId: string) {
  await dbConnect();
  const bill = await findBill(branch, billId);
  const before = bill.payments.length;
  bill.payments = bill.payments.filter((payment: any) => id(payment) !== paymentId);
  if (bill.payments.length === before) throw new BranchError("Payment not found.", 404);
  settle(bill);
  await bill.save();
  return serializeBill(bill.toObject());
}

/** Change the amount, discount or late fee on one bill, or waive / un-waive it. */
export async function adjustBill(branch: BranchKey, billId: string, input: any) {
  await dbConnect();
  const bill = await findBill(branch, billId);
  for (const field of ["amount", "discount", "planDiscount", "lateFee", "admissionFee"] as const) {
    if (input?.[field] === undefined) continue;
    const value = rupeesToPaise(input[field]);
    if (value === null) throw new BranchError("Enter amounts in rupees.");
    bill[field] = value;
  }
  if (input?.waive === true) {
    bill.status = "waived";
    bill.waivedReason = text(input?.reason, 300);
    if (!bill.waivedReason) throw new BranchError("Say why the bill is waived.");
  } else if (input?.waive === false && bill.status === "waived") {
    bill.status = "unpaid";
    bill.waivedReason = undefined;
  }
  if (input?.note !== undefined) bill.note = text(input.note, 300);
  if (billDue(bill) < (bill.paidAmount || 0)) throw new BranchError("The bill cannot be less than what is already paid.");
  settle(bill);
  await bill.save();
  return serializeBill(bill.toObject());
}

/** A one-off bill: a month before billing started, or for a student who has left. */
export async function createBill(branch: BranchKey, input: any) {
  await dbConnect();
  const student: any = await findStudent(branch, String(input?.student || ""));
  if (!isMonthKey(input?.month)) throw new BranchError("Choose a month.");
  const amount = rupeesToPaise(input?.amount ?? student.monthlyFee / 100);
  if (!amount) throw new BranchError("Enter the bill amount.");
  try {
    const bill = await BranchFeeBill.create({ branch, student: student._id, month: input.month, amount, source: "manual", note: text(input?.note, 300) });
    return serializeBill(bill.toObject());
  } catch (error: any) {
    if (error?.code === 11000) throw new BranchError("This student already has a bill for that month.", 409);
    throw error;
  }
}

export async function studentBills(branch: BranchKey, studentId: string) {
  await dbConnect();
  await findStudent(branch, studentId);
  const bills: any[] = await BranchFeeBill.find({ branch, student: studentId }).sort({ month: -1 }).lean();
  return bills.map((bill) => serializeBill(bill));
}

// ---------------------------------------------------------------------------
// Overview, staff, and the student's own view
// ---------------------------------------------------------------------------

export async function branchOverview(branch: BranchKey) {
  await dbConnect();
  const [slots, active, inactive, report, admissionsToReview, changesToReview, missing] = await Promise.all([
    listSlots(branch, { includeInactive: false }),
    BranchStudent.countDocuments({ branch, status: "active" }),
    BranchStudent.countDocuments({ branch, status: "inactive" }),
    monthReport(branch, monthKey()),
    BranchAdmission.countDocuments({ branch, status: "submitted" }),
    BranchSlotChange.countDocuments({ branch, status: "pending" }),
    absentStreaks(branch, academyDateKey(new Date())),
  ]);
  return {
    missingClasses: missing.slice(0, 20),
    admissionsToReview,
    changesToReview,
    activeStudents: active,
    inactiveStudents: inactive,
    slots: slots.length,
    seats: slots.reduce((sum, slot) => sum + slot.capacity, 0),
    freeSeats: slots.reduce((sum, slot) => sum + slot.free, 0),
    fullSlots: slots.filter((slot) => slot.free === 0).length,
    month: report.month,
    totals: report.totals,
  };
}

export async function listStaff(branch: BranchKey) {
  await dbConnect();
  const staff: any[] = await User.find({ branch, role: "instructor" }).select("name email phone username branchRole isActive lastLoginAt").sort({ name: 1 }).lean();
  return staff.map((user) => ({
    id: id(user),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    username: user.username || "",
    branchRole: user.branchRole || "coach",
    isActive: user.isActive !== false,
    lastLoginAt: user.lastLoginAt || null,
  }));
}

/** Branch staff are `instructor` accounts confined to the branch (lib/branch/paths.ts). */
export async function createStaff(branch: BranchKey, input: any, actorId: string) {
  await dbConnect();
  const name = text(input?.name, 120);
  const email = text(input?.email, 200).toLowerCase();
  const phone = text(input?.phone, 20).replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
  const branchRole = input?.branchRole === "manager" ? "manager" : "coach";
  if (!name) throw new BranchError("Enter a name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BranchError("Enter a valid email address.");
  if (await User.exists({ email }).setOptions({ allBranches: true })) throw new BranchError("That email already has an account.", 409);
  const password = tempPassword();
  const user: any = await createUserWithUsername({
    name,
    email,
    phone,
    countryCode: "+91",
    role: "instructor",
    branch,
    branchRole,
    accountStatus: "approved",
    passwordHash: await bcrypt.hash(password, 10),
    tempPassword: password,
    passwordChangedAt: new Date(),
    passwordChangeSource: "registration",
  });
  void recordActivity({
    actor: actorId,
    targetUser: id(user),
    type: "branch.staff_created",
    label: `Created ${branch} ${branchRole} account for ${name}`,
    entityType: "User",
    entityId: id(user),
  });
  return { id: id(user), username: user.username as string, password };
}

export async function setStaffActive(branch: BranchKey, staffId: string, active: boolean) {
  await dbConnect();
  if (!isObjectId(staffId)) throw new BranchError("Staff member not found.", 404);
  // The branch admin's own account is looked after by the academy, not from the staff list.
  const result = await User.updateOne(
    { _id: staffId, branch, role: "instructor", branchRole: { $ne: "admin" } },
    active ? { $set: { isActive: true }, $unset: { deactivatedAt: 1 } } : { $set: { isActive: false, deactivatedAt: new Date() } }
  );
  if (!result.matchedCount) throw new BranchError("Staff member not found.", 404);
}

/** What a branch student sees: their slots and their fees. */
export async function myBranchView(userId: string) {
  await dbConnect();
  const student: any = await BranchStudent.findOne({ user: userId }).lean();
  if (!student) return null;
  await ensureBranchBills(student.branch);
  const [slots, bills] = await Promise.all([
    BranchSlot.find({ _id: { $in: student.slots || [] } }).lean(),
    BranchFeeBill.find({ student: student._id }).sort({ month: -1 }).limit(24).lean(),
  ]);
  const rows = (bills as any[]).map((bill) => serializeBill(bill));
  return {
    name: student.name,
    branch: student.branch as BranchKey,
    status: student.status,
    monthlyFee: student.monthlyFee || 0,
    slots: (slots as any[]).sort(sortSlots).map((slot) => {
      const { students, ...rest } = serializeSlot(slot);
      void students;
      return rest;
    }),
    bills: rows,
    pending: rows.reduce((sum, row) => sum + row.balance, 0),
  };
}
