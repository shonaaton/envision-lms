import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One row per automation email actually handed to the webhook, kept just long
 * enough to recognise a repeat of itself.
 *
 * The send path has no memory of its own: every call posts to the webhook, so a
 * server action that re-runs - a form saved twice, a retried request, a sweep
 * that fires again - mails the same people the same thing again. A coach
 * re-saving one demo assessment sent three staff the same message ten times
 * over. This is the safety net under those call sites: the row is claimed
 * before the send and expires on its own, so the window is self-cleaning and
 * nothing has to be pruned.
 */
const EmailDispatchSchema = new Schema(
  {
    // Hash of recipient + notification identity + rendered content. Unique, so
    // two concurrent sends race for the same row and exactly one wins.
    key: { type: String, required: true, unique: true },
    to: { type: String, default: "", index: true },
    subject: { type: String, default: "" },
    kind: { type: String, default: "", index: true },
    sentAt: { type: Date, default: Date.now },
    // TTL anchor: mongod drops the row once this passes, reopening the window.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

EmailDispatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EmailDispatchDoc = InferSchemaType<typeof EmailDispatchSchema> & { _id: any };
export const EmailDispatch = models.EmailDispatch || model("EmailDispatch", EmailDispatchSchema);
