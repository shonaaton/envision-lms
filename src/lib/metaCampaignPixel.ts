/**
 * The free demo campaign's Meta pixel (dataset) id, shared by the browser pixel
 * (`lib/metaPixel`, client only) and the server's Conversions API sender
 * (`lib/metaConversionsApi`). Kept in its own file because a constant exported
 * from a "use client" module cannot be read on the server.
 */
export const CAMPAIGN_PIXEL_ID = process.env.NEXT_PUBLIC_META_CAMPAIGN_PIXEL_ID || "1084805421260422";
