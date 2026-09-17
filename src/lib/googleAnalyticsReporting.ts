import { getGoogleAnalyticsAccessToken } from "@/lib/googleAnalyticsAuth";

type ReportRow = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
type ReportResponse = { rows?: ReportRow[] };

export type GoogleAnalyticsReport = {
  summary: { activeUsers: number; sessions: number; pageViews: number; newUsers: number; engagementRate: number; averageSessionDuration: number };
  daily: Array<{ date: string; sessions: number }>;
  countries: Array<{ country: string; sessions: number }>;
  cities: Array<{ city: string; sessions: number }>;
  devices: Array<{ device: string; sessions: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  pages: Array<{ path: string; views: number }>;
  events: Array<{ event: string; count: number }>;
};

async function runReport(accessToken: string, propertyId: string, body: Record<string, unknown>): Promise<ReportResponse> {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Google Analytics report request failed.");
  return data;
}

function metric(row: ReportRow | undefined, index: number) { return Number(row?.metricValues?.[index]?.value || 0) || 0; }
function dimension(row: ReportRow, index: number) { return row.dimensionValues?.[index]?.value || "(not set)"; }
function mapped(report: ReportResponse, map: (row: ReportRow) => any) { return (report.rows || []).map(map); }
const sortByMetric = [{ metric: { metricName: "sessions" }, desc: true }];

export async function getGoogleAnalyticsReport(days = 30): Promise<GoogleAnalyticsReport> {
  const { accessToken, propertyId } = await getGoogleAnalyticsAccessToken();
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  const [summary, daily, countries, cities, devices, channels, pages, events] = await Promise.all([
    runReport(accessToken, propertyId, { dateRanges, metrics: ["activeUsers", "sessions", "screenPageViews", "newUsers", "engagementRate", "averageSessionDuration"].map((name) => ({ name })) }),
    runReport(accessToken, propertyId, { dateRanges, dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: String(days) }),
    runReport(accessToken, propertyId, { dateRanges, dimensions: [{ name: "country" }], metrics: [{ name: "sessions" }], orderBys: sortByMetric, limit: "10" }),
    runReport(accessToken, propertyId, { dateRanges, dimensions: [{ name: "city" }], metrics: [{ name: "sessions" }], orderBys: sortByMetric, limit: "10" }),
    runReport(accessToken, propertyId, { dateRanges, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }], orderBys: sortByMetric, limit: "10" }),
    runReport(accessToken, propertyId, { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: sortByMetric, limit: "10" }),
    runReport(accessToken, propertyId, { dateRanges, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: "10" }),
    runReport(accessToken, propertyId, { dateRanges, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: "15" }),
  ]);
  const first = summary.rows?.[0];
  return {
    summary: { activeUsers: metric(first, 0), sessions: metric(first, 1), pageViews: metric(first, 2), newUsers: metric(first, 3), engagementRate: metric(first, 4), averageSessionDuration: metric(first, 5) },
    daily: mapped(daily, (row) => ({ date: dimension(row, 0), sessions: metric(row, 0) })), countries: mapped(countries, (row) => ({ country: dimension(row, 0), sessions: metric(row, 0) })), cities: mapped(cities, (row) => ({ city: dimension(row, 0), sessions: metric(row, 0) })), devices: mapped(devices, (row) => ({ device: dimension(row, 0), sessions: metric(row, 0) })), channels: mapped(channels, (row) => ({ channel: dimension(row, 0), sessions: metric(row, 0) })), pages: mapped(pages, (row) => ({ path: dimension(row, 0), views: metric(row, 0) })), events: mapped(events, (row) => ({ event: dimension(row, 0), count: metric(row, 0) })),
  };
}
