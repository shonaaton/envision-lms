import { Schema, model, models } from "mongoose";

const TemplateSchema = new Schema({
  businessAccountId: { type: String, required: true },
  name: { type: String, required: true },
  language: { type: String, required: true },
  category: { type: String, default: "UTILITY" },
  body: { type: String, default: "" },
  header: { type: String, default: "" },
  footer: { type: String, default: "" },
  variables: [{ _id: false, position: Number, key: String, sample: String }],
  buttons: [Schema.Types.Mixed],
  components: [Schema.Types.Mixed],
  status: { type: String, default: "DRAFT", index: true },
  metaId: { type: String, index: true },
  rejectionReason: { type: String, default: "" },
  submissionError: { type: String, default: "" },
  revision: { type: Number, default: 1 },
  submittedAt: Date,
  lastSyncedAt: Date,
  statusObservedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
TemplateSchema.index({ businessAccountId: 1, name: 1, language: 1 }, { unique: true });

export const WhatsAppTemplate = models.WhatsAppTemplate || model("WhatsAppTemplate", TemplateSchema);
