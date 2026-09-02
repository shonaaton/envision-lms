import { Schema, model, models, type InferSchemaType } from "mongoose";

const AvailabilitySchema = new Schema(
  {
    instructor: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    slots: [
      {
        dayOfWeek: { type: Number, min: 0, max: 6 },
        startTime: String,
        endTime: String,
        slotMinutes: { type: Number, default: 60 },
      },
    ],
    feePerSession: { type: Number, default: 0 }, // paise
    timezone: { type: String, default: "Asia/Kolkata" },
  },
  { timestamps: true }
);

const BookingSchema = new Schema(
  {
    instructor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "confirmed", "cancelled", "completed"], default: "pending" },
    bookingType: { type: String, enum: ["demo", "credit_class", "regular"], default: "regular", index: true },
    demoStatus: {
      type: String,
      enum: ["REQUESTED", "COACH_ASSIGNED", "APPROVED", "CLASSROOM_CREATED", "COMPLETED", "STUDENT_NO_SHOW", "ABSENT", "CANCELLED", "RESCHEDULE_REQUESTED"],
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ["not_required", "pending_admin", "pending_coach", "coach_approved", "coach_cancelled", "reschedule_proposed", "approved", "rejected"],
      default: "not_required",
      index: true,
    },
    meetingUrl: String,
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom" },
    requestedByDemo: { type: Boolean, default: false },
    requestedTimezone: String,
    requestedLocalDateTime: String,
    requestedIstDateTime: String,
    requestedAt: Date,
    assignedCoach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    assignedCoachAt: Date,
    assignedCoachBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    feedbackStatus: { type: String, enum: ["not_required", "pending", "submitted"], default: "not_required", index: true },
    idempotencyKey: { type: String, index: true },
    parentName: String,
    city: String,
    country: String,
    level: String,
    payment: { type: Schema.Types.ObjectId, ref: "Payment" },
    notes: String,
    coachNote: String,
    proposedStartAt: Date,
    proposedEndAt: Date,
  },
  { timestamps: true }
);
BookingSchema.index({ instructor: 1, startAt: 1 }, { unique: true, partialFilterExpression: { instructor: { $exists: true } } });
BookingSchema.index({ student: 1, bookingType: 1, status: 1, startAt: 1 });
BookingSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const Availability = models.Availability || model("Availability", AvailabilitySchema);
export const Booking = models.Booking || model("Booking", BookingSchema);
