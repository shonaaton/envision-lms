import { Schema, model, models, type InferSchemaType } from "mongoose";

const GoogleBusinessLocationSchema = new Schema(
  {
    accountName: { type: String, required: true },
    locationName: { type: String, required: true },
    reviewParent: { type: String, required: true },
    title: String,
    placeId: String,
    address: String,
  },
  { _id: false }
);

const GoogleBusinessIntegrationSchema = new Schema(
  {
    singletonKey: { type: String, default: "google-business", unique: true, index: true },
    refreshToken: { type: String, required: true },
    accessToken: String,
    accessTokenExpiresAt: Date,
    scope: String,
    tokenType: String,
    connectedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    connectedAt: { type: Date, default: Date.now },
    accountNames: [String],
    locations: [GoogleBusinessLocationSchema],
    lastSyncedAt: Date,
    lastSyncError: String,
  },
  { timestamps: true }
);

export type GoogleBusinessIntegrationDoc = InferSchemaType<typeof GoogleBusinessIntegrationSchema> & { _id: any };
export const GoogleBusinessIntegration =
  models.GoogleBusinessIntegration || model("GoogleBusinessIntegration", GoogleBusinessIntegrationSchema);
