import { Schema, model, models, type InferSchemaType } from "mongoose";

const InternalTaskSchema = new Schema(
  {
    title: { type: String, required: true, index: true },
    details: { type: String, default: "" },
    status: { type: String, enum: ["pending", "in_progress", "completed", "cancelled"], default: "pending", index: true },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal", index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", index: true },
    referenceType: { type: String, required: true, index: true },
    referenceId: { type: Schema.Types.ObjectId, required: true, index: true },
    actionHref: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

InternalTaskSchema.index({ referenceType: 1, referenceId: 1 }, { unique: true });

export type InternalTaskDoc = InferSchemaType<typeof InternalTaskSchema> & { _id: any };
export const InternalTask = models.InternalTask || model("InternalTask", InternalTaskSchema);
