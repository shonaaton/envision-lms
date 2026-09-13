import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Local mirror of a CRM lead.
 *
 * Kraya exposes no way to read leads - the only endpoints are an upsert and an
 * outbound webhook - so the portal cannot pull a list and has to accumulate one.
 * The webhook fires on every create and update carrying the whole record, which
 * makes that workable: each event is a complete snapshot, and this collection is
 * the running result of applying them.
 *
 * This is separate from `CrmLead`, which stays what it always was: the sync-state
 * link between a portal user and a lead, holding the `lastPushedStage` guard that
 * stops the two systems echoing at each other. This model holds the content.
 *
 * `notes` and `internalNotes` are deliberately different fields. Kraya's upsert
 * overwrites `notes` with whatever it is sent, so the portal must never put its
 * own commentary there - anything written here stays here.
 */

const StageEventSchema = new Schema(
  {
    stage: { type: String, required: true },
    at: { type: Date, default: Date.now },
    source: { type: String, enum: ["kraya", "portal", "import"], default: "kraya" },
    /** Set only for portal-initiated moves, so a stage change is attributable. */
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: String,
  },
  { _id: false }
);

const CallLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    byName: String,
    outcome: {
      type: String,
      enum: ["connected", "no_answer", "busy", "wrong_number", "callback_requested", "not_interested"],
      default: "connected",
    },
    durationMinutes: { type: Number, default: 0, min: 0 },
    note: String,
    /** Kraya's own call id, returned by the Calls API. Kept so the log can be updated. */
    krayaCallId: { type: String, index: true, sparse: true },
    /** Set when the mirror-out failed, so the drawer can show the call is portal-only. */
    pushError: String,
  },
  { _id: true }
);

const InternalNoteSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    byName: String,
    body: { type: String, required: true },
  },
  { _id: true }
);

const CrmLeadRecordSchema = new Schema(
  {
    crmLeadId: { type: String, required: true, index: true },
    pipeline: String,
    name: String,
    phone: String,
    // Normalized match keys, shared with the existing sync layer - see
    // src/lib/crm/identity.ts. Phone is the strong key; Kraya matches on it too.
    phoneKey: { type: String, index: true },
    email: String,
    emailKey: { type: String, index: true },

    stage: { type: String, index: true },
    previousStage: String,
    stageChangedAt: { type: Date, index: true },

    /** Kraya's own notes field. Overwritten wholesale by each webhook payload. */
    notes: String,
    /**
     * Every key in the webhook payload the portal does not recognise. Kraya lets
     * the academy define arbitrary custom attributes and does not publish their
     * names, so they are kept verbatim and rendered generically rather than being
     * dropped for not fitting a schema.
     */
    attributes: { type: Schema.Types.Mixed, default: {} },
    /**
     * When each attribute last changed value. Attributes are merged, never removed,
     * so a reassigned lead keeps the old owner key too; this is how the newest
     * owner is told apart - see src/lib/crm/leadOwner.ts.
     */
    attributeChangedAt: { type: Schema.Types.Mixed, default: {} },

    firstSeenAt: { type: Date, index: true },
    lastEventAt: { type: Date, index: true },
    lastEventType: { type: String, enum: ["create", "update", "import", "portal"], default: "update" },

    stageHistory: { type: [StageEventSchema], default: [] },

    /** Resolved through findUserForCrmContact when the lead has a portal account. */
    portalUser: { type: Schema.Types.ObjectId, ref: "User", index: true, sparse: true },

    calls: { type: [CallLogSchema], default: [] },
    internalNotes: { type: [InternalNoteSchema], default: [] },

    /** Set when a portal stage push failed, so the CRM screen can surface it. */
    lastPushError: String,
  },
  { timestamps: true }
);

CrmLeadRecordSchema.index({ crmLeadId: 1 }, { unique: true });
CrmLeadRecordSchema.index({ stage: 1, lastEventAt: -1 });
CrmLeadRecordSchema.index({ name: "text", phone: "text", email: "text" });

export type CrmLeadRecordDoc = InferSchemaType<typeof CrmLeadRecordSchema> & { _id: any };
export const CrmLeadRecord = models.CrmLeadRecord || model("CrmLeadRecord", CrmLeadRecordSchema);
