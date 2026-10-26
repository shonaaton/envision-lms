import { Schema, model, models, type InferSchemaType } from "mongoose";

export const POPUP_AUDIENCES = ["all_students", "batch", "course", "student", "demo_students"] as const;
export type PopupAudience = (typeof POPUP_AUDIENCES)[number];

/**
 * A pop-up an admin writes for students to see when they open the portal
 * (/admin/popups). Personal pop-ups (report ready, new badge...) are not stored
 * here: they are worked out per visit in lib/popups/popupService.ts.
 */
const PopupSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 1200 },
    imageUrl: { type: String, trim: true, default: "" },
    ctaLabel: { type: String, trim: true, maxlength: 40, default: "" },
    ctaHref: { type: String, trim: true, default: "" },
    audience: { type: String, enum: POPUP_AUDIENCES, required: true },
    /** Batch, course or student ids, depending on `audience`. */
    targetIds: [{ type: Schema.Types.ObjectId }],
    targetLabel: String,
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, index: true },
    priority: { type: String, enum: ["high", "normal"], default: "normal" },
    status: { type: String, enum: ["draft", "active", "archived"], default: "active", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
  },
  { timestamps: true }
);

/**
 * What one person has done with one pop-up. `key` names it: `campaign:<id>`
 * for an admin pop-up, `auto:<kind>:<source id>` for a personal one. A pop-up
 * keeps coming back until it is dismissed or its button clicked; the unique
 * index is what makes "dismissed" stick.
 */
const PopupViewSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    popup: { type: Schema.Types.ObjectId, ref: "Popup", index: true },
    firstSeenAt: Date,
    lastSeenAt: Date,
    seenCount: { type: Number, default: 0 },
    dismissedAt: Date,
    clickedAt: Date,
  },
  { timestamps: true }
);

PopupViewSchema.index({ user: 1, key: 1 }, { unique: true });

export type PopupDoc = InferSchemaType<typeof PopupSchema> & { _id: any };
export type PopupViewDoc = InferSchemaType<typeof PopupViewSchema> & { _id: any };
export const Popup = models.Popup || model("Popup", PopupSchema);
export const PopupView = models.PopupView || model("PopupView", PopupViewSchema);
