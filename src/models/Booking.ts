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
      enum: ["REQUESTED", "COACH_ASSIGNED", "APPROVED", "CLASSROOM_CREATED", "ASSESSMENT_PENDING", "COMPLETED", "STUDENT_NO_SHOW", "ABSENT", "CANCELLED", "RESCHEDULE_REQUESTED", "CONVERTED", "CLOSED"],
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
    adminNote: String,
    cancellationReason: String,
    rescheduleCount: { type: Number, default: 0 },
    rescheduleHistory: [
      {
        fromStartAt: Date,
        fromEndAt: Date,
        toStartAt: Date,
        toEndAt: Date,
        reason: String,
        requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    proposedStartAt: Date,
    proposedEndAt: Date,
    // Set when a closed demo is revived because the CRM moved the lead back into
    // a demo stage. The original slot is almost always in the past by then, so
    // the booking reopens flagged for a fresh time rather than silently keeping
    // a stale one. `startAt` is required by the schema, so it is left in place
    // as history and `needsNewTime` is what the UI acts on.
    needsNewTime: { type: Boolean, default: false, index: true },
    reopenedAt: Date,
    reopenedFromStage: String,
    // Why it was closed before being revived. Kept so whoever calls the parent
    // back knows what happened last time, since `cancellationReason` is cleared
    // when the booking becomes active again.
    previousCloseReason: String,
  },
  { timestamps: true }
);
BookingSchema.index({ instructor: 1, startAt: 1 }, { unique: true, partialFilterExpression: { instructor: { $exists: true } } });
BookingSchema.index({ student: 1, bookingType: 1, status: 1, startAt: 1 });
BookingSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

/**
 * Mirror demo stage changes into the CRM.
 *
 * `demoStatus` is written from a dozen places (demo center actions, attendance
 * marking, live session teardown, coach feedback, the booking API). Hooking the
 * schema keeps the CRM in step from one place and means new call sites are
 * covered automatically. The sync module is imported lazily because it depends
 * on this model, and it is fire-and-forget so the CRM can never fail a booking.
 */
function scheduleCrmStageSync(doc: any) {
  const bookingId = doc?._id?.toString?.();
  if (!bookingId || doc?.bookingType !== "demo") return;
  import("@/lib/crm/sync")
    .then((module) => module.queueBookingStageSync(bookingId))
    .catch(() => undefined);
}

BookingSchema.post("save", function (doc: any) {
  scheduleCrmStageSync(doc);
});

BookingSchema.post("findOneAndUpdate", function (doc: any) {
  scheduleCrmStageSync(doc);
});

export const Availability = models.Availability || model("Availability", AvailabilitySchema);
export const Booking = models.Booking || model("Booking", BookingSchema);
