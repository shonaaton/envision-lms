import { redirect } from "next/navigation";
import { resolveLeaveViewer } from "@/lib/leave/leaveAccess";
import LeaveClient from "@/components/leave/LeaveClient";

export const dynamic = "force-dynamic";

export default async function LeavePage({ searchParams }: { searchParams: { id?: string; tab?: string } }) {
  // Gate here, not only in the layout: Next renders the page alongside its layout.
  const viewer = await resolveLeaveViewer();
  if (!viewer) redirect("/dashboard?restricted=1");
  return <LeaveClient viewer={viewer} initialId={searchParams.id || ""} initialTab={searchParams.tab || ""} />;
}
