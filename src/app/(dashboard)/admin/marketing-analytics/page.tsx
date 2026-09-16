import { BarChart3, MousePointerClick, PhoneCall, TrendingUp, Users } from "lucide-react";
import { AnalyticsHeader, BarList, Columns, ConsentNote, Stat, countryName } from "@/components/admin/AnalyticsUi";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { RANGE_LABELS, getHighlights, resolveRange } from "@/lib/marketingAnalytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsHighlightsPage({
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
  const data = await getHighlights(range);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <AnalyticsHeader
        title="Marketing Analytics"
        subtitle="Traffic, campaigns and demo conversions from the public site."
        active="/admin/marketing-analytics"
        range={range}
      />
      <ConsentNote />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Site sessions" value={data.sessions.toLocaleString("en-IN")} sub={RANGE_LABELS[range]} icon={Users} delta={data.sessionsChange} />
        <Stat label="Page views" value={data.pageViews.toLocaleString("en-IN")} sub="Across all pages" icon={BarChart3} delta={data.pageViewsChange} />
        <Stat label="Unique visitors" value={data.visitors.toLocaleString("en-IN")} sub="Distinct browsers" icon={Users} delta={data.visitorsChange} />
        <Stat
          label="Clicks to contact"
          value={data.contactClicks.toLocaleString("en-IN")}
          sub="Phone, email and WhatsApp taps"
          icon={PhoneCall}
          delta={data.contactClicksChange}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Demo conversions" value={data.conversions.toLocaleString("en-IN")} sub="Registrations and bookings" icon={MousePointerClick} />
        <Stat label="Conversion rate" value={`${data.conversionRate}%`} sub="Of tracked sessions" icon={TrendingUp} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-slate-950">Sessions over time</h2>
          <span className="text-[11px] font-semibold text-slate-500">Yellow marks days with a conversion</span>
        </div>
        <div className="mt-4">
          <Columns
            points={data.daily.map((day) => ({ label: day.date, value: day.sessions }))}
            marks={data.daily.map((day) => day.conversions > 0)}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <BarList title="Traffic by channel" rows={data.channels.map((row) => ({ label: row.channel, value: row.sessions }))} />
        <BarList title="Top traffic sources" rows={data.sources.map((row) => ({ label: row.source, value: row.sessions }))} />
        <BarList
          title="Sessions by location"
          rows={data.countries.map((row) => ({ label: countryName(row.country), value: row.sessions }))}
          empty="No location data yet. Country is read from the CDN header, so it only appears once the site is behind Cloudflare or Vercel."
        />
      </div>
    </div>
  );
}
