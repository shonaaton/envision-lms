import { Schema, model, models, type InferSchemaType } from "mongoose";
import { BRANCHES } from "@/lib/branch/scope";

/**
 * The offline branch portal (Bowbazar). Kept in its own collections so nothing
 * here reaches the online academy's attendance, invoices, accounts or reports.
 * Branch accounts themselves are `User` documents with `branch` set - see
 * lib/branch/scope.ts for how the online app is kept from seeing them.
 */

/** A weekly class time at the centre. A slot is either online or offline, never mixed. */
const BranchSlotSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    // 0 = Sunday ... 6 = Saturday, like Date#getDay.
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startTime: { type: String, required: true }, // "17:00", IST
    endTime: { type: String, required: true },
    mode: { type: String, enum: ["online", "offline"], default: "offline" },
    capacity: { type: Number, default: 7, min: 1, max: 50 },
    meetingUrl: String,
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);
BranchSlotSchema.index({ branch: 1, dayOfWeek: 1, startTime: 1 }, { unique: true });

/**
 * The branch's record of one student: the family details the admission form
 * collects, the slots they sit in and what they pay. The login itself is the
 * linked `User`.
 */
const BranchStudentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    name: { type: String, required: true },
    // The centre's own registration number ("ECA-2025-5347"), carried over from
    // the sheets it kept before the portal. Re-running the import matches on it.
    regNo: { type: String, index: true },
    slots: [{ type: Schema.Types.ObjectId, ref: "BranchSlot", index: true }],
    parentName: String,
    fatherName: String,
    motherName: String,
    phone: { type: String, index: true },
    email: { type: String, lowercase: true },
    address: String,
    school: String,
    dateOfBirth: Date,
    // Paise, like every amount in the app. Fixed per student: siblings and
    // old joiners can pay different amounts.
    monthlyFee: { type: Number, default: 0, min: 0 },
    // A standing discount on every monthly bill (siblings, scholarships).
    discount: {
      kind: { type: String, enum: ["percent", "flat"] },
      value: { type: Number, min: 0 }, // percent, or paise
      reason: String,
    },
    // One-time fee added to the first bill; set when the student joins.
    admissionFee: { type: Number, default: 0, min: 0 },
    // Set once the admission fee is on a bill, so coming back after a break never charges it again.
    admissionFeeBilledAt: Date,
    // How the family pays: a longer plan raises the whole period's bills at its start, at the plan's discount.
    feePlan: { type: String, enum: ["monthly", "quarterly", "half_yearly", "yearly"], default: "monthly" },
    // First month ("YYYY-MM") this student is billed for.
    feeStartMonth: { type: String, required: true },
    admissionDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
    inactiveSince: Date,
    inactiveReason: String,
    notes: String,
    // The admission form the family filled in, which holds their identity document.
    admission: { type: Schema.Types.ObjectId, ref: "BranchAdmission" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
BranchStudentSchema.index({ branch: 1, status: 1, name: 1 });

const BranchPaymentSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    // "other" is a payment carried over from the old fees report, which never
    // said how the family paid.
    mode: { type: String, enum: ["cash", "upi", "bank", "other"], required: true },
    paidAt: { type: Date, required: true },
    reference: String,
    note: String,
    collectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    collectedByName: String,
    // "BB/26-27/0001", numbered per branch and financial year. Old carried-over payments have none.
    receiptNo: { type: String, index: true },
  },
  { timestamps: true }
);

/**
 * One month's fee for one student. Non-GST, no invoice number: these never
 * enter the online invoice series or the accounts dashboard.
 */
const BranchFeeBillSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent", required: true, index: true },
    month: { type: String, required: true, index: true }, // "YYYY-MM"
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    lateFee: { type: Number, default: 0, min: 0 },
    lateFeeAppliedAt: Date,
    admissionFee: { type: Number, default: 0, min: 0 },
    // The fee plan's discount on this month, apart from the student's own discount.
    planDiscount: { type: Number, default: 0, min: 0 },
    // One-off items added to the month: tournament entry, books, a chess set.
    charges: [
      {
        label: { type: String, required: true },
        kind: { type: String, enum: ["tournament", "material", "exam", "event", "other"], default: "other" },
        amount: { type: Number, required: true, min: 1 },
        note: String,
        addedBy: { type: Schema.Types.ObjectId, ref: "User" },
        addedByName: String,
        addedAt: { type: Date, default: Date.now },
      },
    ],
    payments: [BranchPaymentSchema],
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ["unpaid", "partial", "paid", "waived"], default: "unpaid", index: true },
    waivedReason: String,
    source: { type: String, enum: ["auto", "manual", "import"], default: "auto" },
    note: String,
  },
  { timestamps: true }
);
BranchFeeBillSchema.index({ student: 1, month: 1 }, { unique: true });

/** One student's line on a day's register. */
const BranchAttendanceRecordSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    // Snapshot: the register keeps reading right if the student is renamed or removed.
    name: String,
    status: { type: String, enum: ["present", "late", "absent", "excused"], required: true },
    // What was taught to this student. Offline classes have no syllabus to follow,
    // so this is the only record of where each child has reached.
    topic: String,
    // Shown to the family on the student's page.
    note: String,
    // Homework given on paper or by word of mouth, beside any portal homework.
    homeworkNote: String,
    // Sat in this slot for the day without being one of its members.
    guest: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * A slot's register for one day. Kept apart from the online `Attendance`
 * collection, so it never reaches online reports, pay or feedback.
 */
const BranchAttendanceSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    slot: { type: Schema.Types.ObjectId, ref: "BranchSlot", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD", academy calendar
    // Snapshot of the slot as it was that day; slot times can be edited later.
    slotLabel: String,
    mode: { type: String, enum: ["online", "offline"] },
    records: [BranchAttendanceRecordSchema],
    homework: [{ type: Schema.Types.ObjectId, ref: "Homework" }],
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
    markedByName: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedByName: String,
  },
  { timestamps: true }
);
BranchAttendanceSchema.index({ slot: 1, date: 1 }, { unique: true });
BranchAttendanceSchema.index({ branch: 1, date: -1 });
BranchAttendanceSchema.index({ "records.student": 1, date: -1 });

/** A file a family uploaded with the admission form, kept outside the public uploads. */
const BranchAdmissionFileSchema = new Schema(
  {
    storedName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: Number,
  },
  { _id: false }
);

/**
 * An admission the centre started and the family completes from a link. The
 * link's token is stored only as a hash; sending it again makes a new one.
 */
const BranchAdmissionSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ["sent", "submitted", "approved", "rejected", "cancelled"], default: "sent", index: true },
    // What the centre knew when it sent the link.
    prefill: {
      name: String,
      parentName: String,
      phone: String,
      email: String,
      slots: [{ type: Schema.Types.ObjectId, ref: "BranchSlot" }],
      monthlyFee: { type: Number, default: 0 }, // paise
      note: String,
    },
    // What the family sent back.
    form: {
      name: String,
      dateOfBirth: String,
      school: String,
      parentName: String,
      fatherName: String,
      motherName: String,
      phone: String,
      email: String,
      address: String,
    },
    photo: BranchAdmissionFileSchema,
    idDocument: BranchAdmissionFileSchema,
    submittedAt: Date,
    sends: { type: Number, default: 1 },
    lastSentAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedByName: String,
    decidedAt: Date,
    rejectReason: String,
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent" },
  },
  { timestamps: true }
);
BranchAdmissionSchema.index({ branch: 1, createdAt: -1 });

/**
 * A class-time change: one week's class moved to another slot that week, or a
 * slot given up for another for good. Asked for by the family and decided by
 * staff, or made directly by staff (then approved from the start).
 */
const BranchSlotChangeSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    studentName: String,
    type: { type: String, enum: ["week", "permanent"], required: true },
    // The class given up. Optional for a permanent change by a student with no slot yet.
    fromSlot: { type: Schema.Types.ObjectId, ref: "BranchSlot" },
    toSlot: { type: Schema.Types.ObjectId, ref: "BranchSlot", required: true },
    // One-week moves only: the class missed and the class attended instead, same week.
    fromDate: String,
    toDate: { type: String, index: true },
    // Snapshots, so the history reads right after slot times are edited.
    fromLabel: String,
    toLabel: String,
    reason: String,
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending", index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    requestedByName: String,
    requestedByStaff: { type: Boolean, default: false },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedByName: String,
    decidedAt: Date,
    decisionNote: String,
  },
  { timestamps: true }
);
BranchSlotChangeSchema.index({ branch: 1, status: 1, createdAt: -1 });
BranchSlotChangeSchema.index({ toSlot: 1, toDate: 1, status: 1 });
BranchSlotChangeSchema.index({ fromSlot: 1, fromDate: 1, status: 1 });

/** How the branch runs its fees and family messages. One per branch; everything starts off. */
const BranchSettingsSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, unique: true },
    admissionFee: { type: Number, default: 0, min: 0 }, // paise, suggested for each new student
    proRataFirstMonth: { type: Boolean, default: false },
    // Percent off each month for families paying a longer plan up front.
    planDiscounts: {
      quarterly: { type: Number, default: 0, min: 0, max: 100 },
      half_yearly: { type: Number, default: 0, min: 0, max: 100 },
      yearly: { type: Number, default: 0, min: 0, max: 100 },
    },
    lateFee: { type: Number, default: 0, min: 0 }, // paise; 0 = off
    lateFeeAfterDay: { type: Number, default: 10, min: 1, max: 28 },
    remindersEnabled: { type: Boolean, default: false },
    reminderDays: { type: [Number], default: [1, 5, 10] },
    receiptPrefix: { type: String, default: "BB" },
    parentReportEnabled: { type: Boolean, default: false },
    absenceAlertAfter: { type: Number, default: 3, min: 2, max: 10 },
    // Feature access: what managers and coaches may do. Unset means the defaults in lib/branch/rules.ts.
    roleAccess: { type: Schema.Types.Mixed, default: undefined },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

/** Running numbers (receipts), claimed atomically with $inc. */
const BranchCounterSchema = new Schema({ key: { type: String, required: true, unique: true }, seq: { type: Number, default: 0 } });

/** Someone waiting for a seat in a full slot - a new family or a current student wanting to move. */
const BranchWaitlistSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    slot: { type: Schema.Types.ObjectId, ref: "BranchSlot", required: true, index: true },
    name: { type: String, required: true },
    phone: String,
    note: String,
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent" },
    status: { type: String, enum: ["waiting", "placed", "removed"], default: "waiting", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
    closedAt: Date,
  },
  { timestamps: true }
);

/** One family message about one month: what the student did, as sent. */
const BranchMonthlyReportSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent", required: true },
    month: { type: String, required: true }, // "YYYY-MM"
    data: Schema.Types.Mixed,
    sentAt: Date,
    channels: [String],
  },
  { timestamps: true }
);
BranchMonthlyReportSchema.index({ student: 1, month: 1 }, { unique: true });

/** One fee reminder per student per day, claimed before sending so a restart never repeats it. */
const BranchReminderLogSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true },
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    amount: Number,
    channels: [String],
    manual: { type: Boolean, default: false },
  },
  { timestamps: true }
);
BranchReminderLogSchema.index({ student: 1, date: 1 }, { unique: true });

/** A message from the centre to its families: everyone, some classes, or chosen students. */
const BranchAnnouncementSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    audience: { type: String, enum: ["all", "slots", "students"], default: "all" },
    slots: [{ type: Schema.Types.ObjectId, ref: "BranchSlot" }],
    students: [{ type: Schema.Types.ObjectId, ref: "BranchStudent" }],
    // The logins it reached, so a family's page can list what was sent to them.
    recipients: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    emailed: { type: Number, default: 0 },
    kind: { type: String, enum: ["announcement", "holiday"], default: "announcement" },
    archivedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
  },
  { timestamps: true }
);
BranchAnnouncementSchema.index({ branch: 1, createdAt: -1 });

/** A day the centre is closed: every class, or just some. Registers can't be taken for those classes. */
const BranchHolidaySchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    date: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    slots: [{ type: Schema.Types.ObjectId, ref: "BranchSlot" }], // empty = the whole centre
    reason: { type: String, required: true },
    announcement: { type: Schema.Types.ObjectId, ref: "BranchAnnouncement" },
    cancelledAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
  },
  { timestamps: true }
);

/** A student's result or milestone, kept by the centre and shown on the student's page. */
const BranchAchievementSchema = new Schema(
  {
    branch: { type: String, enum: [...BRANCHES], required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "BranchStudent", required: true, index: true },
    studentName: String,
    title: { type: String, required: true }, // the tournament or milestone
    result: { type: String, required: true }, // "1st place", "Rated 1450"
    level: { type: String, enum: ["Centre", "District", "State", "National", "International", "Rating", "Other"], default: "Other" },
    date: String, // "YYYY-MM-DD"
    note: String,
    imageUrl: String,
    showOnPortal: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
  },
  { timestamps: true }
);
BranchAchievementSchema.index({ branch: 1, date: -1 });

export type BranchSlotDoc = InferSchemaType<typeof BranchSlotSchema> & { _id: any };
export type BranchStudentDoc = InferSchemaType<typeof BranchStudentSchema> & { _id: any };
export type BranchFeeBillDoc = InferSchemaType<typeof BranchFeeBillSchema> & { _id: any };
export type BranchAttendanceDoc = InferSchemaType<typeof BranchAttendanceSchema> & { _id: any };
export type BranchAdmissionDoc = InferSchemaType<typeof BranchAdmissionSchema> & { _id: any };
export type BranchSlotChangeDoc = InferSchemaType<typeof BranchSlotChangeSchema> & { _id: any };

export const BranchSlot = models.BranchSlot || model("BranchSlot", BranchSlotSchema);
export const BranchStudent = models.BranchStudent || model("BranchStudent", BranchStudentSchema);
export const BranchFeeBill = models.BranchFeeBill || model("BranchFeeBill", BranchFeeBillSchema);
export const BranchAttendance = models.BranchAttendance || model("BranchAttendance", BranchAttendanceSchema);
export const BranchAdmission = models.BranchAdmission || model("BranchAdmission", BranchAdmissionSchema);
export const BranchSlotChange = models.BranchSlotChange || model("BranchSlotChange", BranchSlotChangeSchema);
export const BranchSettings = models.BranchSettings || model("BranchSettings", BranchSettingsSchema);
export const BranchCounter = models.BranchCounter || model("BranchCounter", BranchCounterSchema);
export const BranchWaitlist = models.BranchWaitlist || model("BranchWaitlist", BranchWaitlistSchema);
export const BranchMonthlyReport = models.BranchMonthlyReport || model("BranchMonthlyReport", BranchMonthlyReportSchema);
export const BranchReminderLog = models.BranchReminderLog || model("BranchReminderLog", BranchReminderLogSchema);
export const BranchAnnouncement = models.BranchAnnouncement || model("BranchAnnouncement", BranchAnnouncementSchema);
export const BranchHoliday = models.BranchHoliday || model("BranchHoliday", BranchHolidaySchema);
export const BranchAchievement = models.BranchAchievement || model("BranchAchievement", BranchAchievementSchema);
