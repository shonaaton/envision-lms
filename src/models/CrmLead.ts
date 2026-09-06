import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Link between a portal user and their CRM lead.
 *
 * `lastPushedStage` is what makes the two-way sync safe: the outbound hook only
 * fires when the computed stage actually differs from what was last sent, so a
 * CRM webhook that writes to the portal cannot bounce back and start a loop, and
 * the CRM's automatic retries collapse into a single no-op.
 */
const CrmSyncEventSchema = new Schema(
  {
    direction: { type: String, enum: ["outbound", "inbound"], required: true },
    stage: String,
    ok: { type: Boolean, default: true },
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CrmLeadSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    crmLeadId: { type: String, index: true },
    pipeline: String,
    name: String,
    // Normalized match keys - see src/lib/crm/identity.ts
    phoneKey: { type: String, index: true },
    emailKey: { type: String, index: true },

    lastPushedStage: { type: String, index: true },
    lastPushedAt: Date,
    lastPushError: String,

    lastInboundStage: String,
    lastInboundStageKind: { type: String, enum: ["demo", "converted", "closed", "ignore"] },
    lastInboundAt: Date,

    syncEnabled: { type: Boolean, default: true },
    history: { type: [CrmSyncEventSchema], default: [] },
  },
  { timestamps: true }
);

CrmLeadSchema.index({ crmLeadId: 1 }, { unique: true, sparse: true });
CrmLeadSchema.index({ user: 1 }, { unique: true, sparse: true });

export type CrmLeadDoc = InferSchemaType<typeof CrmLeadSchema> & { _id: any };
export const CrmLead = models.CrmLead || model("CrmLead", CrmLeadSchema);
