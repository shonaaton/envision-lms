import { Activity, Eye, Radio } from "lucide-react";
import { AnalyticsHeader, BarList, Columns, ConsentNote, Stat, countryName } from "@/components/admin/AnalyticsUi";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { getRealtimeSnapshot } from "@/lib/marketingAnalytics";
import RealtimeAnalyticsRefresh from "@/components/admin/RealtimeAnalyticsRefresh";

export const dynamic = "force-dynamic";
/** Cheap enough to re-read often; the page also refreshes itself client-side. */
export const revalidate = 0;

function ago(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

const typeLabel: Record<string, string> = {
  pageview: "Viewed",
  conversion: "Converted",
  click: "Clicked",
};

export default async function RealtimeAnalyticsPage() {
  const session = await auth();
  if (!(await canAccessFeature("marketingAnalytics", session?.user as any, "view"))) {
    return <div className="p-6 text-sm font-semibold text-slate-600">Forbidden</div>;
  }

  const data = await getRealtimeSnapshot();

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <RealtimeAnalyticsRefresh />

      <AnalyticsHeader
        title="Real-time Analytics"
        subtitle="What is happening on the site right now. Refreshes every 30 seconds."
        active="/admin/marketing-analytics/realtime"
        showRange={false}
      />
      <ConsentNote />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active now" value={String(data.activeNow)} sub="Sessions active in the last 5 minutes" icon={Radio} />
        <Stat label="Last 30 minutes" value={String(data.last30Minutes)} sub="Distinct sessions" icon={Activity} />
        <Stat label="Views in 30 minutes" value={String(data.viewsLast30)} sub="Page views" icon={Eye} />
      </div>

      <div className="card">
        <h2 className="text-sm font-black text-slate-950">Page views per minute</h2>
        <div className="mt-4">
          <Columns points={data.minutes.map((minute) => ({ label: minute.minute, value: minute.views }))} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <BarList title="Pages being viewed" unit="views" rows={data.pages.map((row) => ({ label: row.path, value: row.views }))} empty="Nothing in the last 30 minutes." />
        <BarList title="Traffic source" rows={data.sources.map((row) => ({ label: row.source, value: row.sessions }))} empty="Nothing in the last 30 minutes." />
        <BarList title="Device" rows={data.devices.map((row) => ({ label: row.device, value: row.sessions }))} empty="Nothing in the last 30 minutes." />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <BarList
          title="Where they are"
          rows={data.countries.map((row) => ({ label: countryName(row.country), value: row.sessions }))}
          empty="No location data. Country comes from the CDN header, so it appears once the site is behind Cloudflare or Vercel."
        />

        <div className="card">
          <h2 className="text-sm font-black text-slate-950">Live activity</h2>
          {data.recent.length ? (
            <ul className="mt-3 divide-y divide-slate-200/70">
              {data.recent.map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-bold text-slate-950">{typeLabel[event.type] || event.type}</span>{" "}
                    <span className="text-slate-700">{event.label || event.path}</span>
                    {event.label ? <span className="block truncate text-xs text-slate-500">{event.path}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {event.country ? `${countryName(event.country)} · ` : ""}
                    {event.device} · {ago(event.at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No activity in the last 30 minutes.</p>
          )}
        </div>
      </div>
    </div>
  );
}
