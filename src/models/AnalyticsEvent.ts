import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * First-party marketing analytics.
 *
 * Deliberately thin on personal data: no IP address, no user agent string and no
 * full referrer URL - only the referring host. A visitor is identified by two
 * anonymous ids the browser generates: `sessionId` dies with the tab, and
 * `visitorId` persists so "new vs returning" is answerable. Neither is ever
 * linked to a User record.
 *
 * Country is resolved from the edge geo header on the request and stored as a
 * two-letter code; the IP it was derived from is never written down.
 *
 * Events are only sent when analytics consent is on, so this collection is a
 * sample of consenting visitors rather than all traffic - every dashboard that
 * reads it says so.
 */
const AnalyticsEventSchema = new Schema(
  {
    type: { type: String, enum: ["pageview", "conversion", "click"], required: true, index: true },
    /** Pathname only; query strings can carry personal data. */
    path: { type: String, required: true, index: true },
    /** The first path this session landed on, so entry pages can be ranked. */
    landingPath: { type: String, default: "" },
    /** Host only - "google.com", not the full URL. Empty means direct. */
    referrerHost: { type: String, default: "", index: true },

    utmSource: { type: String, default: "", index: true },
    utmMedium: { type: String, default: "", index: true },
    utmCampaign: { type: String, default: "", index: true },
    utmTerm: { type: String, default: "" },
    utmContent: { type: String, default: "" },

    /** Anonymous, per tab. Not tied to any account. */
    sessionId: { type: String, required: true, index: true },
    /** Anonymous, persists across visits, so returning visitors can be counted. */
    visitorId: { type: String, default: "", index: true },
    /** True when this session is the visitor's first. */
    isNewVisitor: { type: Boolean, default: true },

    device: { type: String, enum: ["mobile", "tablet", "desktop"], default: "desktop", index: true },
    /** ISO 3166-1 alpha-2, from the edge header. "" when unknown. */
    country: { type: String, default: "", index: true },

    /** Position of this page within its session, so flows can be reconstructed. */
    pageIndex: { type: Number, default: 0 },
    /** Milliseconds spent on the page, sent when leaving it. */
    durationMs: { type: Number, default: 0 },

    /** For `conversion` rows: what converted, e.g. "demo_registration". */
    conversionType: { type: String, default: "", index: true },
    /** For `click` rows: "contact" | "cta" | "outbound", plus a short label. */
    clickType: { type: String, default: "", index: true },
    clickLabel: { type: String, default: "" },

    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Every dashboard slices by time first, then by dimension.
AnalyticsEventSchema.index({ occurredAt: -1, type: 1 });
AnalyticsEventSchema.index({ occurredAt: -1, utmCampaign: 1 });
AnalyticsEventSchema.index({ sessionId: 1, pageIndex: 1 });

export type AnalyticsEventDoc = InferSchemaType<typeof AnalyticsEventSchema> & { _id: any };
export const AnalyticsEvent = models.AnalyticsEvent || model("AnalyticsEvent", AnalyticsEventSchema);
