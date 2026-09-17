import { CheckCircle2, ExternalLink, MapPinned, MonitorSmartphone, MousePointerClick, TriangleAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";

export default async function GoogleAnalyticsPage() {
  const session = await auth();
  if (!(await canAccessFeature("marketingAnalytics", session?.user as any, "view"))) {
    return <div className="p-6 text-sm font-semibold text-slate-600">Forbidden</div>;
  }

  const connected = Boolean(measurementId);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-black text-slate-950">Google Analytics</h1>
        <p className="mt-1 text-sm text-slate-600">GA4 reporting is separate from the academy&apos;s internal analytics dashboard.</p>
      </header>

      <div className={`flex items-start gap-3 rounded-xl border p-4 ${connected ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        {connected ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={20} /> : <TriangleAlert className="mt-0.5 shrink-0 text-amber-700" size={20} />}
        <div>
          <p className="font-black text-slate-950">{connected ? "GA4 is connected" : "GA4 needs a Measurement ID"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            {connected
              ? `Public, consented visits are being sent to ${measurementId}. Open Google Analytics to view its independent reports.`
              : "Add NEXT_PUBLIC_GA_MEASUREMENT_ID to the production environment, then rebuild and restart the LMS."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <InfoCard icon={MapPinned} title="Location" text="Country, region and city, derived by GA4 from consented visits." />
        <InfoCard icon={MonitorSmartphone} title="Technology" text="Device type, browser, operating system, screen size and language." />
        <InfoCard icon={MousePointerClick} title="Marketing actions" text="Page views, source and campaign attribution, contact clicks, demo interest, leads and demo registrations." />
      </div>

      <div className="card">
        <h2 className="text-sm font-black text-slate-950">Open the GA4 reports</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Google&apos;s reports are intentionally separate from internal analytics, so their consented-session counts may differ.</p>
        <a className="btn mt-4 w-fit bg-brand text-white hover:bg-brand-800" href="https://analytics.google.com/" target="_blank" rel="noreferrer">
          Open Google Analytics <ExternalLink size={15} />
        </a>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, title, text }: { icon: typeof MapPinned; title: string; text: string }) {
  return (
    <div className="card">
      <Icon size={18} className="text-brand" />
      <h2 className="mt-3 text-sm font-black text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
