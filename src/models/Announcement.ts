import { Schema, model, models, type InferSchemaType } from "mongoose";

const AnnouncementSchema = new Schema(
  {
    title: { type: String, required: true, index: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ["normal", "high"], default: "normal", index: true },
    targetType: {
      type: String,
      enum: ["batch", "all_students", "student", "all_coaches", "coach"],
      required: true,
      index: true,
    },
    targetBatch: { type: Schema.Types.ObjectId, ref: "Batch", index: true },
    targetUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    recipients: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    recipientCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ sentAt: -1, priority: 1 });

export type AnnouncementDoc = InferSchemaType<typeof AnnouncementSchema> & { _id: any };
export const Announcement = models.Announcement || model("Announcement", AnnouncementSchema);
