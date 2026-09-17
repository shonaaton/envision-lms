import { Schema, model, models, type InferSchemaType } from "mongoose";
import { CONTACT_STATUSES } from "@/lib/contactEnquiries";

/**
 * One submission of the public contact form.
 *
 * Kept separate from `CoachApplication` and `DemoBooking` because it is not an
 * application for anything: it is somebody asking a question, and the only
 * promise the site makes is that a human reads it. The sales inbox at
 * `/sales/enquiries` is the whole consumer.
 *
 * `interest` holds either "online" or a Kolkata centre slug, so a reply can go
 * to the right centre in-charge without anyone re-reading the message.
 */
const ContactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    address: { type: String, trim: true },
    countryCode: { type: String, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    interest: { type: String, required: true, index: true },
    message: { type: String, trim: true },
    status: { type: String, enum: CONTACT_STATUSES, default: "new", index: true },
    /** Who moved it out of "new", so the inbox says who is already on it. */
    handledBy: { type: Schema.Types.ObjectId, ref: "User" },
    handledByName: { type: String, trim: true },
    handledAt: Date,
    /** The page the form was submitted from, for attribution. */
    sourcePath: { type: String, trim: true },
  },
  { timestamps: true }
);

/** The inbox's default view: newest first, optionally narrowed by status or centre. */
ContactMessageSchema.index({ status: 1, createdAt: -1 });
ContactMessageSchema.index({ interest: 1, createdAt: -1 });

export type ContactMessageDoc = InferSchemaType<typeof ContactMessageSchema> & { _id: any };

export const ContactMessage = models.ContactMessage || model("ContactMessage", ContactMessageSchema);
