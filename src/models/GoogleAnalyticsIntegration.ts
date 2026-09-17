import { Schema, model, models, type InferSchemaType } from "mongoose";

const GoogleAnalyticsIntegrationSchema = new Schema(
  {
    singletonKey: { type: String, default: "google-analytics", unique: true, index: true },
    propertyId: { type: String, required: true },
    refreshToken: { type: String, required: true },
    accessToken: String,
    accessTokenExpiresAt: Date,
    scope: String,
    tokenType: String,
    connectedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    connectedAt: { type: Date, default: Date.now },
    lastReportError: String,
  },
  { timestamps: true }
);

export type GoogleAnalyticsIntegrationDoc = InferSchemaType<typeof GoogleAnalyticsIntegrationSchema> & { _id: any };
export const GoogleAnalyticsIntegration =
  models.GoogleAnalyticsIntegration || model("GoogleAnalyticsIntegration", GoogleAnalyticsIntegrationSchema);
