import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { AnalyticsEvent } from "@/models/AnalyticsEvent";

export const dynamic = "force-dynamic";

/**
 * Public collection endpoint for first-party analytics.
 *
 * Unauthenticated by necessity - it records anonymous visitors - so everything
 * is treated as hostile: fields are whitelisted, lengths are capped, the type is
 * constrained, and nothing identifying from the request is stored. The country
 * is read from the edge geo header and kept as a two-letter code; the IP it came
 * from is never written down.
 *
 * A failure here must never surface to the visitor, so errors return 204 too.
 */

const MAX = { path: 512, host: 128, utm: 128, id: 64, label: 80 };
const MAX_DURATION_MS = 30 * 60 * 1000;

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Pathname only - a query string can carry an email or a token. */
function cleanPath(value: unknown) {
  const raw = clean(value, MAX.path);
  if (!raw.startsWith("/")) return "";
  return raw.split("?")[0].split("#")[0];
}

/** Whichever edge put us behind sets one of these; none of them is an IP. */
function country(req: Request) {
  const headers = req.headers;
  const raw =
    headers.get("cf-ipcountry") ||
    headers.get("x-vercel-ip-country") ||
    headers.get("x-geo-country") ||
    headers.get("x-country-code") ||
    "";
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return new NextResponse(null, { status: 204 });

    const type = ["pageview", "conversion", "click"].includes(body.type) ? body.type : "";
    const path = cleanPath(body.path);
    const sessionId = clean(body.sessionId, MAX.id);
    if (!type || !path || !sessionId) return new NextResponse(null, { status: 204 });

    const device = ["mobile", "tablet", "desktop"].includes(body.device) ? body.device : "desktop";
    const clickType = ["contact", "cta", "outbound"].includes(body.clickType) ? body.clickType : "";
    const durationRaw = Number(body.durationMs);
    const durationMs = Number.isFinite(durationRaw) ? Math.max(0, Math.min(durationRaw, MAX_DURATION_MS)) : 0;
    const indexRaw = Number(body.pageIndex);
    const pageIndex = Number.isFinite(indexRaw) ? Math.max(0, Math.min(Math.trunc(indexRaw), 500)) : 0;

    await dbConnect();
    await AnalyticsEvent.create({
      type,
      path,
      landingPath: cleanPath(body.landingPath) || path,
      referrerHost: clean(body.referrerHost, MAX.host).toLowerCase(),
      utmSource: clean(body.utmSource, MAX.utm).toLowerCase(),
      utmMedium: clean(body.utmMedium, MAX.utm).toLowerCase(),
      utmCampaign: clean(body.utmCampaign, MAX.utm).toLowerCase(),
      utmTerm: clean(body.utmTerm, MAX.utm),
      utmContent: clean(body.utmContent, MAX.utm),
      sessionId,
      visitorId: clean(body.visitorId, MAX.id),
      isNewVisitor: body.isNewVisitor !== false,
      device,
      country: country(req),
      pageIndex,
      durationMs,
      conversionType: type === "conversion" ? clean(body.conversionType, MAX.id) : "",
      clickType: type === "click" ? clickType : "",
      clickLabel: type === "click" ? clean(body.clickLabel, MAX.label) : "",
      occurredAt: new Date(),
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Analytics must never break a page or leak that the database is down.
    return new NextResponse(null, { status: 204 });
  }
}
