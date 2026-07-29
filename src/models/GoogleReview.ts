import { Schema, model, models, type InferSchemaType } from "mongoose";

const GoogleReviewSchema = new Schema(
  {
    googleReviewId: { type: String, required: true, unique: true, index: true },
    reviewerName: { type: String, required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true, index: true },
    text: { type: String, default: "" },
    profilePhotoUrl: String,
    relativePublishTimeDescription: String,
    publishTime: Date,
    updateTime: Date,
    source: { type: String, enum: ["places", "business_profile"], default: "places", index: true },
    placeId: String,
    placeName: String,
    googleMapsUrl: String,
    syncedAt: { type: Date, default: Date.now, index: true },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

GoogleReviewSchema.index({ reviewerName: "text", text: "text" });

export type GoogleReviewDoc = InferSchemaType<typeof GoogleReviewSchema> & { _id: any };
export const GoogleReview = models.GoogleReview || model("GoogleReview", GoogleReviewSchema);
