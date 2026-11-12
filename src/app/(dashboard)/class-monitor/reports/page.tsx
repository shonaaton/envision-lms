import { redirect } from "next/navigation";
import { resolveClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import ClassMonitorReportsClient from "@/components/class-monitor/ClassMonitorReportsClient";

export const dynamic = "force-dynamic";

export default async function ClassMonitorReportsPage({ searchParams }: { searchParams: { date?: string; month?: string } }) {
  const viewer = await resolveClassMonitorViewer();
  if (!viewer) redirect("/dashboard?restricted=1");
  return <ClassMonitorReportsClient viewer={viewer} initialDate={searchParams.date || ""} initialMonth={searchParams.month || ""} />;
}
