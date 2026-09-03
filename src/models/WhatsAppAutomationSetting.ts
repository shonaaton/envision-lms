import { Schema, model, models, type InferSchemaType } from "mongoose";

const WhatsAppAutomationSettingSchema = new Schema(
  {
    templateName: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: true, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export type WhatsAppAutomationSettingDoc = InferSchemaType<typeof WhatsAppAutomationSettingSchema> & { _id: any };
export const WhatsAppAutomationSetting = models.WhatsAppAutomationSetting || model("WhatsAppAutomationSetting", WhatsAppAutomationSettingSchema);
