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
    /** Required by the contact form's validator. The free demo form does not ask for one. */
    email: { type: String, lowercase: true, trim: true, index: true },
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
    /**
     * Demo requests only: the ad tags (utm_*, campaign/ad set/ad ids, placement)
     * or the referring site the family arrived with - see src/lib/leadSource.ts.
     * `leadChannel` is worked out from it on save, for the CRM's source filter.
     */
    leadSource: {
      _id: false,
      utm_source: String,
      utm_medium: String,
      utm_campaign: String,
      utm_id: String,
      utm_term: String,
      utm_content: String,
      campaign_id: String,
      adset_id: String,
      ad_id: String,
      placement: String,
      fbclid: String,
      gclid: String,
      referrer: String,
      landingPath: String,
    },
    leadChannel: { type: String, trim: true, index: true },

    /** Absent on older rows, which are all contact-form messages. See src/lib/demoRequest.ts. */
    kind: { type: String, enum: ["contact", "demo_request"], default: "contact", index: true },
    ageGroup: { type: String, trim: true },
    childLevel: { type: String, trim: true },
    preferredTime: { type: String, trim: true },
    /**
     * True from "Submit details" until the code is entered (or could not be sent).
     * Such a request is not a lead yet: see SUBMITTED_DEMO_REQUEST in src/lib/demoRequest.ts.
     */
    awaitingCode: Boolean,
    /** Set once the family has entered the code sent to this WhatsApp number. */
    whatsappVerifiedAt: Date,
    /** Set when the code could not be sent, so sales knows why it is unverified. */
    otpFailedAt: Date,
    /** When sales was told about this request. Claimed once - see src/lib/demoRequestLead.ts. */
    announcedAt: Date,
    /**
     * The demo time the family asked for on the thank-you page: an IST day
     * (YYYY-MM-DD) and hour (HH:mm) from src/lib/demoRequestSlots.ts. A
     * preference for sales to confirm, not a booking.
     */
    demoSlotDate: { type: String, trim: true },
    demoSlotTime: { type: String, trim: true },
    demoSlotAt: Date,

    /**
     * The Demo Leads CRM (/sales/leads), demo requests only. The owner is set by
     * rotation when the request is submitted - see src/lib/demoLeadCrm.ts - and
     * a salesperson sees only the leads they own.
     */
    salesOwner: { type: Schema.Types.ObjectId, ref: "User", index: true },
    salesOwnerName: { type: String, trim: true },
    salesAssignedAt: Date,
    /** One of DEMO_LEAD_STAGES. Absent on requests older than the CRM, which read as "new". */
    leadStage: { type: String, trim: true, index: true },
    leadStageAt: Date,
    /**
     * Notes, calls, reminders, stage and owner moves, oldest first. A call's
     * `at` is the server's clock when the salesperson pressed Picked up or
     * Missed, and its remarks are in `text` after the first line.
     */
    leadLog: [
      {
        _id: false,
        kind: { type: String, enum: ["note", "stage", "owner", "call", "reminder"], default: "note" },
        /** Calls only: one of DEMO_LEAD_CALL_OUTCOMES. */
        outcome: { type: String, trim: true },
        text: { type: String, trim: true },
        by: { type: Schema.Types.ObjectId, ref: "User" },
        byName: { type: String, trim: true },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

/** The inbox's default view: newest first, optionally narrowed by status or centre. */
ContactMessageSchema.index({ status: 1, createdAt: -1 });
ContactMessageSchema.index({ interest: 1, createdAt: -1 });
ContactMessageSchema.index({ kind: 1, salesOwner: 1, createdAt: -1 });

/** One counter per rotation: who the next form lead goes to. Claimed with $inc so two leads at once never share a turn. */
const DemoLeadRotationSchema = new Schema({ key: { type: String, required: true, unique: true }, seq: { type: Number, default: 0 } });
export const DemoLeadRotation = models.DemoLeadRotation || model("DemoLeadRotation", DemoLeadRotationSchema);

export type ContactMessageDoc = InferSchemaType<typeof ContactMessageSchema> & { _id: any };

export const ContactMessage = models.ContactMessage || model("ContactMessage", ContactMessageSchema);
