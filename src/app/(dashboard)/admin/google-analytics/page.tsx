import { Activity, BarChart3, Clock3, MousePointerClick, Users } from "lucide-react";
import { BarList, Columns, DataTable, Stat, countryName } from "@/components/admin/AnalyticsUi";
import { GoogleAnalyticsConnect } from "@/components/admin/GoogleAnalyticsConnect";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { getGoogleAnalyticsIntegration } from "@/lib/googleAnalyticsAuth";
import { getGoogleAnalyticsReport } from "@/lib/googleAnalyticsReporting";

export const dynamic = "force-dynamic";

function range(value: string | string[] | undefined) {
  return value === "7" || value === "90" ? Number(value) : 30;
}

export default async function GoogleAnalyticsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!(await canAccessFeature("marketingAnalytics", session?.user as any, "view"))) return <div className="p-6 text-sm font-semibold text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  const days = range(params.range);
  const integration: any = await getGoogleAnalyticsIntegration();
  const configured = Boolean(integration?.propertyId && integration?.refreshToken);
  let report: Awaited<ReturnType<typeof getGoogleAnalyticsReport>> | null = null;
  let error = "";
  if (configured) {
    try { report = await getGoogleAnalyticsReport(days); } catch (cause) { error = cause instanceof Error ? cause.message : "Google Analytics reports could not be loaded."; }
  }

  return <div className="space-y-4 p-4 lg:p-6">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><h1 className="text-xl font-black text-slate-950">Google Analytics</h1><p className="mt-1 text-sm text-slate-600">GA4 reports inside the LMS, kept separate from Internal Analytics.</p></div>
      <nav className="flex gap-1.5" aria-label="Google Analytics date range">{[7, 30, 90].map((value) => <a key={value} href={`/admin/google-analytics?range=${value}`} className={`btn ${days === value ? "bg-brand text-white" : "border border-brand/20 bg-white text-brand hover:bg-brand-50"}`}>{value} days</a>)}</nav>
    </header>
    {params.connected === "1" ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Google Analytics is connected. Your GA4 reports now load here.</div> : null}
    {!configured ? <GoogleAnalyticsConnect /> : error ? <><GoogleAnalyticsConnect propertyId={integration.propertyId} /><div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">Google Analytics is connected but the report request failed: {error}</div></> : report ? <><GoogleAnalyticsConnect propertyId={integration.propertyId} /><ReportDashboard report={report} days={days} /></> : null}
  </div>;
}

function ReportDashboard({ report, days }: { report: Awaited<ReturnType<typeof getGoogleAnalyticsReport>>; days: number }) {
  const percentage = `${(report.summary.engagementRate * 100).toFixed(1)}%`;
  const duration = `${Math.floor(report.summary.averageSessionDuration / 60)}m ${Math.round(report.summary.averageSessionDuration % 60)}s`;
  return <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Stat label="Active users" value={report.summary.activeUsers.toLocaleString("en-IN")} sub={`Last ${days} days`} icon={Users} /><Stat label="Sessions" value={report.summary.sessions.toLocaleString("en-IN")} sub="GA4 sessions" icon={Activity} /><Stat label="Page views" value={report.summary.pageViews.toLocaleString("en-IN")} sub="GA4 views" icon={BarChart3} /><Stat label="New users" value={report.summary.newUsers.toLocaleString("en-IN")} sub="First visits" icon={Users} /><Stat label="Engagement rate" value={percentage} sub="Engaged sessions" icon={MousePointerClick} /><Stat label="Average session" value={duration} sub="Engagement time" icon={Clock3} /></div>
    <div className="card"><h2 className="text-sm font-black text-slate-950">Sessions over time</h2><div className="mt-4"><Columns points={report.daily.map((row) => ({ label: row.date.slice(4), value: row.sessions }))} /></div></div>
    <div className="grid gap-3 lg:grid-cols-3"><BarList title="Countries" rows={report.countries.map((row) => ({ label: countryName(row.country), value: row.sessions }))} /><BarList title="Cities" rows={report.cities.map((row) => ({ label: row.city, value: row.sessions }))} /><BarList title="Devices" rows={report.devices.map((row) => ({ label: row.device, value: row.sessions }))} /></div>
    <div className="grid gap-3 lg:grid-cols-2"><BarList title="Traffic channels" rows={report.channels.map((row) => ({ label: row.channel, value: row.sessions }))} /><BarList title="Top pages" unit="views" rows={report.pages.map((row) => ({ label: row.path, value: row.views }))} /></div>
    <DataTable title="GA4 events" note="Includes automatic page events and the public-site lead and demo events sent by the academy." head={["Event", "Count"]} rows={report.events.map((row) => [row.event, row.count])} />
  </>;
}
