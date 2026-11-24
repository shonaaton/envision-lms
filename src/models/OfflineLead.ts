import { Schema, model, models } from "mongoose";

export const OFFLINE_BRANCHES = ["bowbazar", "new-alipore", "haridevpur", "jodhpur-park"] as const;
export type OfflineBranch = (typeof OFFLINE_BRANCHES)[number];

const OfflineLeadSchema = new Schema(
  {
    branch: { type: String, enum: [...OFFLINE_BRANCHES], required: true, index: true },
    parentName: { type: String, required: true, trim: true },
    studentName: { type: String, trim: true },
    countryCode: { type: String, trim: true, default: "+91" },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    note: { type: String, trim: true },
    status: { type: String, enum: ["open", "converted", "lost"], default: "open", index: true },
    source: { type: String, enum: ["manual", "demo_crm"], default: "manual" },
    sourceDemoLead: { type: Schema.Types.ObjectId, ref: "ContactMessage", index: true },
    bowbazarLead: { type: Schema.Types.ObjectId, ref: "BranchLead" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
    centreContactName: String,
    centreContactPhone: String,
    assignmentSentAt: Date,
    assignmentError: String,
    day5DueAt: Date,
    day5ClaimedAt: Date,
    day5SentAt: Date,
    day5Error: String,
    day10DueAt: Date,
    day10ClaimedAt: Date,
    day10SentAt: Date,
    day10Error: String,
    outcomeAt: Date,
    outcomeBy: String,
    history: [
      {
        _id: false,
        kind: { type: String, enum: ["created", "sent", "outcome", "note"] },
        text: String,
        byName: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

OfflineLeadSchema.index({ status: 1, day5DueAt: 1 });
OfflineLeadSchema.index({ status: 1, day10DueAt: 1 });
OfflineLeadSchema.index({ sourceDemoLead: 1 }, { unique: true, sparse: true });

export const OfflineLead = models.OfflineLead || model("OfflineLead", OfflineLeadSchema);
