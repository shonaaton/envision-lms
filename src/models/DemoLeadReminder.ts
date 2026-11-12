import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * A call-back reminder a salesperson set on a Demo Leads CRM lead.
 *
 * `scheduled` until `dueAt`; the minute sweep (src/lib/demoLeadReminders.ts)
 * claims it as `sent`, raises a task and emails the person it is for. Logging
 * a call on the lead after that settles it as `done`. `cancelled` when the
 * person removes it or the lead is deleted.
 *
 * `assignedTo` is who gets reminded: the person who set it, or the lead's new
 * owner if an admin hands the lead to someone else before it fires.
 */
const DemoLeadReminderSchema = new Schema(
  {
    lead: { type: Schema.Types.ObjectId, ref: "ContactMessage", required: true, index: true },
    leadName: { type: String, trim: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedToName: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: { type: String, trim: true },
    dueAt: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["scheduled", "sent", "done", "cancelled"], default: "scheduled" },
    sentAt: Date,
    doneAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);

/** The sweep: due reminders, oldest first. */
DemoLeadReminderSchema.index({ status: 1, dueAt: 1 });

export type DemoLeadReminderDoc = InferSchemaType<typeof DemoLeadReminderSchema> & { _id: any };
export const DemoLeadReminder = models.DemoLeadReminder || model("DemoLeadReminder", DemoLeadReminderSchema);
