import { Repeat, UserPlus, Users } from "lucide-react";
import { AnalyticsHeader, BarList, Columns, ConsentNote, DataTable, Stat, countryName } from "@/components/admin/AnalyticsUi";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { RANGE_LABELS, getTrafficOverview, resolveRange } from "@/lib/marketingAnalytics";

export const dynamic = "force-dynamic";

export default async function TrafficOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!(await canAccessFeature("marketingAnalytics", session?.user as any, "view"))) {
    return <div className="p-6 text-sm font-semibold text-slate-600">Forbidden</div>;
  }

  const params = searchParams ? await searchParams : {};
  const range = resolveRange(typeof params.range === "string" ? params.range : undefined);
  const data = await getTrafficOverview(range);

  const newShare = data.sessions ? Math.round((data.newVisitors / data.sessions) * 100) : 0;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <AnalyticsHeader
        title="Traffic Overview"
        subtitle="Where sessions come from, on what device, and from which part of the world."
        active="/admin/marketing-analytics/traffic"
        range={range}
      />
      <ConsentNote />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Sessions" value={data.sessions.toLocaleString("en-IN")} sub={RANGE_LABELS[range]} icon={Users} />
        <Stat label="New visitors" value={data.newVisitors.toLocaleString("en-IN")} sub={`${newShare}% of sessions`} icon={UserPlus} />
        <Stat label="Returning visitors" value={data.returningVisitors.toLocaleString("en-IN")} sub={`${100 - newShare}% of sessions`} icon={Repeat} />
      </div>

      <div className="card">
        <h2 className="text-sm font-black text-slate-950">Sessions over time</h2>
        <div className="mt-4">
          <Columns points={data.daily.map((day) => ({ label: day.date, value: day.sessions }))} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <BarList title="Sessions by channel" rows={data.channels.map((row) => ({ label: row.channel, value: row.sessions }))} />
        <BarList title="Sessions by device" rows={data.devices.map((row) => ({ label: row.device, value: row.sessions }))} />
        <BarList title="Average sessions by weekday" rows={data.byWeekday.map((row) => ({ label: row.day, value: row.sessions }))} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <BarList
          title="Sessions by country"
          rows={data.countries.map((row) => ({ label: countryName(row.country), value: row.sessions }))}
          empty="No location data yet. Country is read from the CDN header, so it appears once the site is behind Cloudflare or Vercel."
        />
        <DataTable
          title="Traffic sources"
          note="Referring host, with how many of those sessions booked a demo."
          head={["Source", "Sessions", "Conversions"]}
          rows={data.sources.map((row) => [row.source, row.sessions, row.conversions])}
        />
      </div>

      <DataTable
        title="Campaign performance"
        note="Sessions arriving with a utm_campaign tag, and how many converted."
        head={["Campaign", "Source", "Medium", "Sessions", "Conversions", "Rate"]}
        rows={data.campaigns.map((row) => [row.campaign, row.source, row.medium, row.sessions, row.conversions, `${row.rate}%`])}
        empty="No tagged campaigns yet. Add ?utm_source=…&utm_medium=…&utm_campaign=… to your advert links and they will appear here."
      />
    </div>
  );
}
