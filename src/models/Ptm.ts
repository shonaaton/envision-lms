import { Schema, model, models } from "mongoose";
import { PTM_STATUSES } from "@/lib/ptm/ptmRules";

const ref = (name = "User") => ({ type: Schema.Types.ObjectId, ref: name });
const PtmSchema = new Schema({
  student: { ...ref(), required: true }, coach: { ...ref(), required: true }, classroom: { ...ref("Classroom"), required: true },
  studentName: String, coachName: String, ptmYear: { type: String, required: true },
  status: { type: String, enum: PTM_STATUSES, default: "requested", required: true },
  preferredAt: { type: Date, required: true }, preferredNote: String, reason: { type: String, required: true, minlength: 10 },
  approvedBy: ref(), approvedAt: Date, rejectedBy: ref(), rejectedAt: Date, rejectionReason: String,
  cancelledBy: ref(), cancelledAt: Date, cancelReason: String,
  scheduledAt: Date, durationMinutes: { type: Number, default: 30 }, meetingUrl: String, scheduledBy: ref(),
  feedback: { type: new Schema({ rating: { type: Number, min: 1, max: 5 }, preparedness: { type: Number, min: 1, max: 5 }, clarity: { type: Number, min: 1, max: 5 }, comments: String, submittedAt: Date }, { _id: false }), default: undefined },
}, { timestamps: true });
PtmSchema.index({ student: 1, ptmYear: 1, status: 1 });
PtmSchema.index({ coach: 1, status: 1 });
PtmSchema.index({ status: 1, scheduledAt: 1 });
// Protect even simultaneous requests, including requests across the year boundary.
PtmSchema.index({ student: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["requested", "approved"] } } });
export const Ptm = models.Ptm || model("Ptm", PtmSchema);
