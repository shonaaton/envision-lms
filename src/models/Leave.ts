import { Schema, model, models } from "mongoose";
import { LEAVE_CREDIT_ENTRY_TYPES, LEAVE_STATUSES, LEAVE_TYPES, OPEN_LEAVE_STATUSES } from "@/lib/leave/leaveRules";

const ref = (name = "User") => ({ type: Schema.Types.ObjectId, ref: name });

/** A class the leave takes the applicant away from, as it stood when snapshotted. */
const LeaveSessionSchema = new Schema({
  classroom: { ...ref("Classroom"), required: true },
  sessionId: { type: String, required: true },
  title: String,
  start: { type: Date, required: true },
  end: Date,
  studentCount: Number,
}, { _id: false });

const LeaveRequestSchema = new Schema({
  applicant: { ...ref(), required: true },
  applicantName: String,
  applicantRole: { type: String, enum: ["instructor", "sub-admin"], required: true },
  /** Set when an admin or Sub Admin recorded the leave for the applicant. */
  filedBy: ref(), filedByName: String,
  type: { type: String, enum: LEAVE_TYPES, required: true },
  /** The leave day as an academy (IST) calendar date, `YYYY-MM-DD`. */
  dateKey: { type: String, required: true },
  /** When the leave begins: IST midnight, or the first chosen class for a coach's half day. */
  startsAt: { type: Date, required: true },
  sessions: { type: [LeaveSessionSchema], default: [] },
  reason: { type: String, required: true },
  status: { type: String, enum: LEAVE_STATUSES, default: "requested", required: true },
  creditCost: { type: Number, required: true },
  /** What approval actually took from a credit account; 0 for someone without a limit. */
  creditCharged: { type: Number, default: 0 },
  decidedBy: ref(), decidedByName: String, decidedAt: Date, rejectionReason: String,
  cancelledBy: ref(), cancelledAt: Date, cancelReason: String,
  coveredAt: Date,
}, { timestamps: true });
LeaveRequestSchema.index({ status: 1, startsAt: 1 });
LeaveRequestSchema.index({ applicant: 1, createdAt: -1 });
// One open leave per person per day, even for two requests sent at once.
LeaveRequestSchema.index({ applicant: 1, dateKey: 1 }, { unique: true, partialFilterExpression: { status: { $in: OPEN_LEAVE_STATUSES } } });

/** Present only for staff an admin has given credits to; no document means no limit. */
const LeaveCreditAccountSchema = new Schema({
  user: { ...ref(), required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 },
  totalGranted: { type: Number, default: 0 },
}, { timestamps: true });

const LeaveCreditEntrySchema = new Schema({
  user: { ...ref(), required: true, index: true },
  type: { type: String, enum: LEAVE_CREDIT_ENTRY_TYPES, required: true },
  amount: { type: Number, required: true },
  balanceAfter: Number,
  leaveRequest: ref("LeaveRequest"),
  by: ref(),
  byName: String,
  note: String,
}, { timestamps: true });

export const LeaveRequest = models.LeaveRequest || model("LeaveRequest", LeaveRequestSchema);
export const LeaveCreditAccount = models.LeaveCreditAccount || model("LeaveCreditAccount", LeaveCreditAccountSchema);
export const LeaveCreditEntry = models.LeaveCreditEntry || model("LeaveCreditEntry", LeaveCreditEntrySchema);
