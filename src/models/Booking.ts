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
    instructor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "confirmed", "cancelled", "completed"], default: "pending" },
    meetingUrl: String,
    payment: { type: Schema.Types.ObjectId, ref: "Payment" },
    notes: String,
  },
  { timestamps: true }
);
BookingSchema.index({ instructor: 1, startAt: 1 }, { unique: true });

export const Availability = models.Availability || model("Availability", AvailabilitySchema);
export const Booking = models.Booking || model("Booking", BookingSchema);
