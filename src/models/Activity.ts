import { Schema, model, models, type InferSchemaType } from "mongoose";

const ActivitySchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    targetUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    type: { type: String, required: true, index: true },
    label: { type: String, required: true },
    entityType: { type: String, index: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    metadata: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

ActivitySchema.index({ occurredAt: -1, type: 1 });

export type ActivityDoc = InferSchemaType<typeof ActivitySchema> & { _id: any };
export const Activity = models.Activity || model("Activity", ActivitySchema);
