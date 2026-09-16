import { ArrowRight, Clock, Layers, LogOut } from "lucide-react";
import { AnalyticsHeader, ConsentNote, DataTable, Stat } from "@/components/admin/AnalyticsUi";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { getBehaviourOverview, resolveRange } from "@/lib/marketingAnalytics";

export const dynamic = "force-dynamic";

function duration(seconds: number) {
  if (!seconds) return "0s";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export default async function BehaviourOverviewPage({
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
  const data = await getBehaviourOverview(range);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <AnalyticsHeader
        title="Behaviour Overview"
        subtitle="How far people get, what they read, where they leave and what they click."
        active="/admin/marketing-analytics/behaviour"
        range={range}
      />
      <ConsentNote />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Avg session duration" value={duration(data.avgSessionSeconds)} sub="Time on page, summed per session" icon={Clock} />
        <Stat label="Avg pages per session" value={String(data.avgPagesPerSession)} sub={`Across ${data.sessions.toLocaleString("en-IN")} sessions`} icon={Layers} />
        <Stat label="Bounce rate" value={`${data.bounceRate}%`} sub="Sessions that viewed one page only" icon={LogOut} />
      </div>

      <DataTable
        title="Top pages"
        note="Ranked by views, with how long people stay and how often they leave from there."
        head={["Path", "Views", "Avg time", "Exit rate"]}
        rows={data.topPages.map((row) => [row.path, row.views, duration(row.avgSeconds), `${row.exitRate}%`])}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <DataTable
          title="Landing pages"
          note="The first page of a session, and how many of those sessions went no further."
          head={["Entry path", "Sessions", "Bounce"]}
          rows={data.landingPages.map((row) => [row.path, row.sessions, `${row.bounceRate}%`])}
        />
        <DataTable
          title="Exit pages"
          note="The last page a session saw."
          head={["Path", "Exits"]}
          rows={data.exitPages.map((row) => [row.path, row.exits])}
        />
      </div>

      <div className="card">
        <h2 className="text-sm font-black text-slate-950">Top navigation flows</h2>
        <p className="mt-1 text-xs text-slate-500">The most common page-to-page steps within a session.</p>
        {data.flows.length ? (
          <ul className="mt-3 space-y-2">
            {data.flows.map((flow) => (
              <li key={`${flow.from}->${flow.to}`} className="flex items-center gap-2 rounded-lg border border-slate-200/70 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-950">{flow.from}</span>
                <ArrowRight size={14} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-950">{flow.to}</span>
                <span className="shrink-0 font-bold tabular-nums text-brand">{flow.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No multi-page sessions recorded in this range yet.</p>
        )}
      </div>

      <DataTable
        title="Top clicks"
        note="Contact taps, demo buttons and outbound links."
        head={["Label", "Type", "Clicks"]}
        rows={data.clicks.map((row) => [row.label, row.type, row.count])}
        empty="No tracked clicks in this range."
      />
    </div>
  );
}
