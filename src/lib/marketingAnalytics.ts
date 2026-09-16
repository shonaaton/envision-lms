import "server-only";
import { dbConnect } from "@/lib/db";
import { AnalyticsEvent } from "@/models/AnalyticsEvent";

/**
 * Aggregations behind the marketing analytics dashboards.
 *
 * Every figure counts visitors who allowed analytics cookies, never all traffic.
 * The pages state that plainly rather than letting a consent-limited sample be
 * mistaken for the whole picture.
 *
 * Session-shaped metrics (bounce, duration, exits, flows) are derived by first
 * rolling events up per session, because a "session" is not a stored row - it is
 * a group of events that share a `sessionId`.
 */

export type RangeKey = "7d" | "30d" | "90d";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function resolveRange(value?: string | null): RangeKey {
  return value === "7d" || value === "30d" || value === "90d" ? value : "30d";
}

export function rangeWindow(range: RangeKey) {
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
  // The equivalent window immediately before, for period-on-period comparison.
  const previousFrom = new Date(from.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
  return { from, to, previousFrom, previousTo: from };
}

async function connected() {
  try {
    await dbConnect();
    return true;
  } catch {
    // No database configured: empty dashboards beat an error page.
    return false;
  }
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);

/* ======================================================= shared session roll-up */

type SessionRoll = {
  _id: string;
  views: number;
  firstAt: Date;
  lastAt: Date;
  duration: number;
  landing: string;
  exitPath: string;
  device: string;
  country: string;
  referrerHost: string;
  campaign: string;
  source: string;
  medium: string;
  isNew: boolean;
  conversions: number;
};

/** One document per session in the window, with its pages already counted. */
async function sessionRolls(from: Date, to: Date): Promise<SessionRoll[]> {
  return AnalyticsEvent.aggregate([
    { $match: { occurredAt: { $gte: from, $lte: to } } },
    { $sort: { occurredAt: 1 } },
    {
      $group: {
        _id: "$sessionId",
        views: { $sum: { $cond: [{ $eq: ["$type", "pageview"] }, 1, 0] } },
        conversions: { $sum: { $cond: [{ $eq: ["$type", "conversion"] }, 1, 0] } },
        duration: { $sum: "$durationMs" },
        firstAt: { $first: "$occurredAt" },
        lastAt: { $last: "$occurredAt" },
        landing: { $first: "$landingPath" },
        exitPath: { $last: "$path" },
        device: { $first: "$device" },
        country: { $first: "$country" },
        referrerHost: { $first: "$referrerHost" },
        campaign: { $first: "$utmCampaign" },
        source: { $first: "$utmSource" },
        medium: { $first: "$utmMedium" },
        isNew: { $first: "$isNewVisitor" },
      },
    },
  ]);
}

const tally = <T>(rows: T[], key: (row: T) => string) => {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

/** Groups traffic the way a marketer reads it, not the way it is stored. */
function channelOf(roll: SessionRoll) {
  if (roll.medium === "cpc" || roll.medium === "paid" || roll.source === "meta" || roll.source === "google_ads") return "Paid";
  if (roll.campaign) return "Campaign";
  if (!roll.referrerHost) return "Direct";
  if (/google|bing|duckduckgo|yahoo/.test(roll.referrerHost)) return "Organic search";
  if (/facebook|instagram|linkedin|t\.co|twitter|x\.com|youtube|whatsapp/.test(roll.referrerHost)) return "Social";
  return "Referral";
}

/* =============================================================== highlights */

export type Highlights = {
  range: RangeKey;
  from: Date;
  to: Date;
  sessions: number;
  sessionsChange: number | null;
  pageViews: number;
  pageViewsChange: number | null;
  visitors: number;
  visitorsChange: number | null;
  contactClicks: number;
  contactClicksChange: number | null;
  conversions: number;
  conversionRate: number;
  daily: { date: string; sessions: number; views: number; conversions: number }[];
  channels: { channel: string; sessions: number }[];
  sources: { source: string; sessions: number }[];
  countries: { country: string; sessions: number }[];
};

const emptyHighlights = (range: RangeKey, from: Date, to: Date): Highlights => ({
  range, from, to,
  sessions: 0, sessionsChange: null,
  pageViews: 0, pageViewsChange: null,
  visitors: 0, visitorsChange: null,
  contactClicks: 0, contactClicksChange: null,
  conversions: 0, conversionRate: 0,
  daily: [], channels: [], sources: [], countries: [],
});

async function windowTotals(from: Date, to: Date) {
  const rows = await AnalyticsEvent.aggregate([
    { $match: { occurredAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        pageViews: { $sum: { $cond: [{ $eq: ["$type", "pageview"] }, 1, 0] } },
        contactClicks: { $sum: { $cond: [{ $eq: ["$clickType", "contact"] }, 1, 0] } },
        sessions: { $addToSet: "$sessionId" },
        visitors: { $addToSet: "$visitorId" },
      },
    },
    { $project: { pageViews: 1, contactClicks: 1, sessions: { $size: "$sessions" }, visitors: { $size: "$visitors" } } },
  ]);
  return rows[0] || { pageViews: 0, contactClicks: 0, sessions: 0, visitors: 0 };
}

export async function getHighlights(range: RangeKey): Promise<Highlights> {
  const { from, to, previousFrom, previousTo } = rangeWindow(range);
  if (!(await connected())) return emptyHighlights(range, from, to);

  const [now, before, rolls, dailyRows] = await Promise.all([
    windowTotals(from, to),
    windowTotals(previousFrom, previousTo),
    sessionRolls(from, to),
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } },
          views: { $sum: { $cond: [{ $eq: ["$type", "pageview"] }, 1, 0] } },
          conversions: { $sum: { $cond: [{ $eq: ["$type", "conversion"] }, 1, 0] } },
          sessions: { $addToSet: "$sessionId" },
        },
      },
      { $project: { views: 1, conversions: 1, sessions: { $size: "$sessions" } } },
    ]),
  ]);

  const byDay = new Map(dailyRows.map((row: any) => [row._id, row]));
  const daily: Highlights["daily"] = [];
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    const row: any = byDay.get(key);
    daily.push({
      date: key,
      views: Number(row?.views || 0),
      sessions: Number(row?.sessions || 0),
      conversions: Number(row?.conversions || 0),
    });
  }

  const conversions = rolls.reduce((total, roll) => total + roll.conversions, 0);

  return {
    range, from, to,
    sessions: now.sessions,
    sessionsChange: change(now.sessions, before.sessions),
    pageViews: now.pageViews,
    pageViewsChange: change(now.pageViews, before.pageViews),
    visitors: now.visitors,
    visitorsChange: change(now.visitors, before.visitors),
    contactClicks: now.contactClicks,
    contactClicksChange: change(now.contactClicks, before.contactClicks),
    conversions,
    conversionRate: pct(conversions, now.sessions),
    daily,
    channels: tally(rolls, channelOf).map(([channel, sessions]) => ({ channel, sessions })),
    sources: tally(rolls, (r) => r.referrerHost || "Direct").slice(0, 8).map(([source, sessions]) => ({ source, sessions })),
    countries: tally(rolls.filter((r) => r.country), (r) => r.country).slice(0, 10).map(([country, sessions]) => ({ country, sessions })),
  };
}

/* ================================================================== traffic */

export type TrafficOverview = {
  range: RangeKey;
  sessions: number;
  visitors: number;
  newVisitors: number;
  returningVisitors: number;
  daily: { date: string; sessions: number }[];
  byWeekday: { day: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  countries: { country: string; sessions: number }[];
  channels: { channel: string; sessions: number }[];
  sources: { source: string; sessions: number; conversions: number }[];
  campaigns: { campaign: string; source: string; medium: string; sessions: number; conversions: number; rate: number }[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getTrafficOverview(range: RangeKey): Promise<TrafficOverview> {
  const { from, to } = rangeWindow(range);
  const base: TrafficOverview = {
    range, sessions: 0, visitors: 0, newVisitors: 0, returningVisitors: 0,
    daily: [], byWeekday: [], devices: [], countries: [], channels: [], sources: [], campaigns: [],
  };
  if (!(await connected())) return base;

  const rolls = await sessionRolls(from, to);
  if (!rolls.length) return base;

  const daily = new Map<string, number>();
  const weekday = new Map<string, number>();
  for (const roll of rolls) {
    const date = new Date(roll.firstAt);
    daily.set(dayKey(date), (daily.get(dayKey(date)) || 0) + 1);
    const wd = WEEKDAYS[date.getDay()];
    weekday.set(wd, (weekday.get(wd) || 0) + 1);
  }

  const dailySeries: TrafficOverview["daily"] = [];
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    dailySeries.push({ date: key, sessions: daily.get(key) || 0 });
  }

  const sourceMap = new Map<string, { sessions: number; conversions: number }>();
  const campaignMap = new Map<string, { campaign: string; source: string; medium: string; sessions: number; conversions: number }>();
  for (const roll of rolls) {
    const key = roll.referrerHost || "Direct";
    const entry = sourceMap.get(key) || { sessions: 0, conversions: 0 };
    entry.sessions += 1;
    entry.conversions += roll.conversions;
    sourceMap.set(key, entry);

    if (roll.campaign) {
      const ck = `${roll.campaign}|${roll.source}|${roll.medium}`;
      const c = campaignMap.get(ck) || { campaign: roll.campaign, source: roll.source || "(none)", medium: roll.medium || "(none)", sessions: 0, conversions: 0 };
      c.sessions += 1;
      c.conversions += roll.conversions;
      campaignMap.set(ck, c);
    }
  }

  return {
    range,
    sessions: rolls.length,
    visitors: new Set(rolls.map((r) => r._id)).size,
    newVisitors: rolls.filter((r) => r.isNew).length,
    returningVisitors: rolls.filter((r) => !r.isNew).length,
    daily: dailySeries,
    byWeekday: WEEKDAYS.map((day) => ({ day, sessions: weekday.get(day) || 0 })),
    devices: tally(rolls, (r) => r.device || "desktop").map(([device, sessions]) => ({ device, sessions })),
    countries: tally(rolls.filter((r) => r.country), (r) => r.country).slice(0, 12).map(([country, sessions]) => ({ country, sessions })),
    channels: tally(rolls, channelOf).map(([channel, sessions]) => ({ channel, sessions })),
    sources: [...sourceMap.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 12),
    campaigns: [...campaignMap.values()]
      .map((c) => ({ ...c, rate: pct(c.conversions, c.sessions) }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 15),
  };
}

/* ================================================================ behaviour */

export type BehaviourOverview = {
  range: RangeKey;
  avgSessionSeconds: number;
  avgPagesPerSession: number;
  bounceRate: number;
  sessions: number;
  topPages: { path: string; views: number; avgSeconds: number; exitRate: number }[];
  landingPages: { path: string; sessions: number; bounceRate: number }[];
  exitPages: { path: string; exits: number }[];
  clicks: { label: string; type: string; count: number }[];
  flows: { from: string; to: string; count: number }[];
};

const emptyBehaviour = (range: RangeKey): BehaviourOverview => ({
  range, avgSessionSeconds: 0, avgPagesPerSession: 0, bounceRate: 0, sessions: 0,
  topPages: [], landingPages: [], exitPages: [], clicks: [], flows: [],
});

export async function getBehaviourOverview(range: RangeKey): Promise<BehaviourOverview> {
  const { from, to } = rangeWindow(range);
  if (!(await connected())) return emptyBehaviour(range);

  const [rolls, pageRows, clickRows, flowRows] = await Promise.all([
    sessionRolls(from, to),
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: from, $lte: to }, type: "pageview" } },
      { $group: { _id: "$path", views: { $sum: 1 }, totalMs: { $sum: "$durationMs" }, timed: { $sum: { $cond: [{ $gt: ["$durationMs", 0] }, 1, 0] } } } },
      { $sort: { views: -1 } },
      { $limit: 15 },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: from, $lte: to }, type: "click" } },
      { $group: { _id: { label: "$clickLabel", type: "$clickType" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    // Consecutive page pairs within a session, which is what a flow diagram is.
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: from, $lte: to }, type: "pageview" } },
      { $sort: { sessionId: 1, pageIndex: 1 } },
      { $group: { _id: "$sessionId", paths: { $push: "$path" } } },
      { $project: { pairs: { $zip: { inputs: ["$paths", { $slice: ["$paths", 1, 500] }] } } } },
      { $unwind: "$pairs" },
      { $project: { from: { $arrayElemAt: ["$pairs", 0] }, to: { $arrayElemAt: ["$pairs", 1] } } },
      { $match: { to: { $ne: null } } },
      { $group: { _id: { from: "$from", to: "$to" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
  ]);

  if (!rolls.length) return emptyBehaviour(range);

  const sessions = rolls.length;
  const bounced = rolls.filter((roll) => roll.views <= 1).length;
  const totalMs = rolls.reduce((total, roll) => total + roll.duration, 0);
  const totalViews = rolls.reduce((total, roll) => total + roll.views, 0);

  const exits = tally(rolls, (roll) => roll.exitPath || "/");
  const exitCount = new Map(exits);

  const landingMap = new Map<string, { sessions: number; bounced: number }>();
  for (const roll of rolls) {
    const key = roll.landing || "/";
    const entry = landingMap.get(key) || { sessions: 0, bounced: 0 };
    entry.sessions += 1;
    if (roll.views <= 1) entry.bounced += 1;
    landingMap.set(key, entry);
  }

  return {
    range,
    sessions,
    avgSessionSeconds: Math.round(totalMs / sessions / 1000),
    avgPagesPerSession: Math.round((totalViews / sessions) * 10) / 10,
    bounceRate: pct(bounced, sessions),
    topPages: pageRows.map((row: any) => ({
      path: row._id || "/",
      views: row.views,
      avgSeconds: row.timed ? Math.round(row.totalMs / row.timed / 1000) : 0,
      exitRate: pct(exitCount.get(row._id) || 0, row.views),
    })),
    landingPages: [...landingMap.entries()]
      .map(([path, v]) => ({ path, sessions: v.sessions, bounceRate: pct(v.bounced, v.sessions) }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10),
    exitPages: exits.slice(0, 10).map(([path, count]) => ({ path, exits: count })),
    clicks: clickRows.map((row: any) => ({ label: row._id.label || "(unlabelled)", type: row._id.type || "other", count: row.count })),
    flows: flowRows.map((row: any) => ({ from: row._id.from, to: row._id.to, count: row.count })),
  };
}

/* ================================================================= realtime */

export type RealtimeSnapshot = {
  activeNow: number;
  last30Minutes: number;
  viewsLast30: number;
  minutes: { minute: string; views: number }[];
  pages: { path: string; views: number }[];
  sources: { source: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  countries: { country: string; sessions: number }[];
  recent: { path: string; at: string; device: string; country: string; type: string; label: string }[];
};

const emptyRealtime = (): RealtimeSnapshot => ({
  activeNow: 0, last30Minutes: 0, viewsLast30: 0,
  minutes: [], pages: [], sources: [], devices: [], countries: [], recent: [],
});

export async function getRealtimeSnapshot(): Promise<RealtimeSnapshot> {
  if (!(await connected())) return emptyRealtime();

  const now = new Date();
  const from30 = new Date(now.getTime() - 30 * 60 * 1000);
  const from5 = new Date(now.getTime() - 5 * 60 * 1000);

  const events: any[] = await AnalyticsEvent.find({ occurredAt: { $gte: from30 } })
    .sort({ occurredAt: -1 })
    .limit(800)
    .lean();

  if (!events.length) return emptyRealtime();

  const active = new Set(events.filter((e) => new Date(e.occurredAt) >= from5).map((e) => e.sessionId));
  const sessions30 = new Set(events.map((e) => e.sessionId));
  const views = events.filter((e) => e.type === "pageview");

  // One bucket per minute across the window, so quiet minutes read as zero.
  const buckets = new Map<string, number>();
  for (let i = 29; i >= 0; i -= 1) {
    const stamp = new Date(now.getTime() - i * 60 * 1000);
    buckets.set(`${stamp.getHours()}:${String(stamp.getMinutes()).padStart(2, "0")}`, 0);
  }
  for (const event of views) {
    const stamp = new Date(event.occurredAt);
    const key = `${stamp.getHours()}:${String(stamp.getMinutes()).padStart(2, "0")}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  // Dimensions are counted per session, not per event, so one busy visitor does
  // not look like a crowd.
  const firstBySession = new Map<string, any>();
  for (const event of [...events].reverse()) if (!firstBySession.has(event.sessionId)) firstBySession.set(event.sessionId, event);
  const uniqueSessions = [...firstBySession.values()];

  return {
    activeNow: active.size,
    last30Minutes: sessions30.size,
    viewsLast30: views.length,
    minutes: [...buckets.entries()].map(([minute, count]) => ({ minute, views: count })),
    pages: tally(views, (e: any) => e.path || "/").slice(0, 8).map(([path, count]) => ({ path, views: count })),
    sources: tally(uniqueSessions, (e: any) => e.referrerHost || "Direct").slice(0, 6).map(([source, sessions]) => ({ source, sessions })),
    devices: tally(uniqueSessions, (e: any) => e.device || "desktop").map(([device, sessions]) => ({ device, sessions })),
    countries: tally(uniqueSessions.filter((e: any) => e.country), (e: any) => e.country).slice(0, 6).map(([country, sessions]) => ({ country, sessions })),
    recent: events.slice(0, 15).map((event) => ({
      path: event.path || "/",
      at: new Date(event.occurredAt).toISOString(),
      device: event.device || "desktop",
      country: event.country || "",
      type: event.type,
      label: event.clickLabel || event.conversionType || "",
    })),
  };
}
