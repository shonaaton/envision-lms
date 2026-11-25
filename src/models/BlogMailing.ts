import { Schema, model, models } from "mongoose";

/**
 * "New blog post" emails.
 *
 * Posts are code, so a post is "added" when a deploy brings a slug the
 * database has never seen. `BlogPostMailState` remembers every slug the job
 * has looked at; `BlogMailing` is one send (one or more new posts, one email
 * per address); `BlogMailRecipient` claims each address once per mailing, so
 * siblings sharing a parent's inbox get one copy and a restart never resends.
 */

const BlogPostMailStateSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    /**
     * seeded  - already live when the automation was switched on; never mailed.
     * queued  - new on this deploy; part of `mailing`.
     * skipped - new slug, but published too long ago to be news (a re-added post).
     */
    state: { type: String, enum: ["seeded", "queued", "skipped"], required: true },
    mailing: { type: Schema.Types.ObjectId, ref: "BlogMailing" },
  },
  { timestamps: true }
);

const BlogMailingSchema = new Schema(
  {
    slugs: [{ type: String, required: true }],
    status: { type: String, enum: ["pending", "sending", "sent"], default: "pending", index: true },
    claimedAt: Date,
    /** Last user `_id` finished, so a restart resumes instead of starting over. */
    cursor: { type: Schema.Types.ObjectId },
    usersDone: { type: Number, default: 0 },
    emailsSent: { type: Number, default: 0 },
    emailsFailed: { type: Number, default: 0 },
    finishedAt: Date,
  },
  { timestamps: true }
);

const BlogMailRecipientSchema = new Schema(
  {
    mailing: { type: Schema.Types.ObjectId, ref: "BlogMailing", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);
BlogMailRecipientSchema.index({ mailing: 1, email: 1 }, { unique: true });

/** An address that asked not to get "new blog post" emails. Per address, because parents have no account. */
const BlogEmailOptOutSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** The email the link came from, for the record. */
    recipient: { type: Schema.Types.ObjectId, ref: "BlogMailRecipient" },
  },
  { timestamps: true }
);

export const BlogEmailOptOut = models.BlogEmailOptOut || model("BlogEmailOptOut", BlogEmailOptOutSchema);
export const BlogPostMailState = models.BlogPostMailState || model("BlogPostMailState", BlogPostMailStateSchema);
export const BlogMailing = models.BlogMailing || model("BlogMailing", BlogMailingSchema);
export const BlogMailRecipient = models.BlogMailRecipient || model("BlogMailRecipient", BlogMailRecipientSchema);
