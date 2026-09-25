import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One staff to-do. Automatic tasks are raised by app events and keyed by the
 * record they are about (`referenceType` + `referenceId`), so each trigger
 * uses its own referenceType and re-raising is a no-op. Manual tasks use
 * `referenceType: "Manual"` with `referenceId` set to the task's own `_id`.
 *
 * A task is either assigned to one person or left in a `pool` ("admins" /
 * "sales") that everyone in that pool sees until one of them completes it.
 */
const InternalTaskSchema = new Schema(
  {
    title: { type: String, required: true, index: true },
    details: { type: String, default: "" },
    status: { type: String, enum: ["pending", "in_progress", "completed", "cancelled"], default: "pending", index: true },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal", index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", index: true },
    pool: { type: String, enum: ["admins", "sales", null], default: null },
    source: { type: String, enum: ["auto", "manual"], default: "auto", index: true },
    kind: { type: String, default: "" },
    referenceType: { type: String, required: true, index: true },
    referenceId: { type: Schema.Types.ObjectId, required: true, index: true },
    actionHref: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    completionNotes: { type: String, default: "" },
    completionAuto: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    cancelReason: { type: String, default: "" },
    overdueNotifiedAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

InternalTaskSchema.index({ referenceType: 1, referenceId: 1 }, { unique: true });
InternalTaskSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
InternalTaskSchema.index({ pool: 1, status: 1 });
InternalTaskSchema.index({ createdBy: 1, status: 1 });

export type InternalTaskDoc = InferSchemaType<typeof InternalTaskSchema> & { _id: any };
export const InternalTask = models.InternalTask || model("InternalTask", InternalTaskSchema);
