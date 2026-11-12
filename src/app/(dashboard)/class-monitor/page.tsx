import { redirect } from "next/navigation";
import { resolveClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import ClassMonitorClient from "@/components/class-monitor/ClassMonitorClient";

export const dynamic = "force-dynamic";

export default async function ClassMonitorPage({ searchParams }: { searchParams: { date?: string; id?: string } }) {
  // Gate here, not only in the layout: Next renders the page alongside its layout.
  const viewer = await resolveClassMonitorViewer();
  if (!viewer) redirect("/dashboard?restricted=1");
  return <ClassMonitorClient viewer={viewer} initialDate={searchParams.date || ""} initialId={searchParams.id || ""} />;
}
