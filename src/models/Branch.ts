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

export type BranchSlotDoc = InferSchemaType<typeof BranchSlotSchema> & { _id: any };
export type BranchStudentDoc = InferSchemaType<typeof BranchStudentSchema> & { _id: any };
export type BranchFeeBillDoc = InferSchemaType<typeof BranchFeeBillSchema> & { _id: any };
export type BranchAttendanceDoc = InferSchemaType<typeof BranchAttendanceSchema> & { _id: any };
export type BranchAdmissionDoc = InferSchemaType<typeof BranchAdmissionSchema> & { _id: any };

export const BranchSlot = models.BranchSlot || model("BranchSlot", BranchSlotSchema);
export const BranchStudent = models.BranchStudent || model("BranchStudent", BranchStudentSchema);
export const BranchFeeBill = models.BranchFeeBill || model("BranchFeeBill", BranchFeeBillSchema);
export const BranchAttendance = models.BranchAttendance || model("BranchAttendance", BranchAttendanceSchema);
export const BranchAdmission = models.BranchAdmission || model("BranchAdmission", BranchAdmissionSchema);
