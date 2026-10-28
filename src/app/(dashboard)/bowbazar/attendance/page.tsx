import AttendanceClient from "@/components/bowbazar/AttendanceClient";
import { requireBranchPage } from "@/lib/branch/page";
import { todayKey } from "@/lib/branch/rules";

export const dynamic = "force-dynamic";

export default async function BowbazarAttendancePage() {
  const { can } = await requireBranchPage("attendance");
  // Today on the academy's calendar, not the browser's.
  return <AttendanceClient can={can} today={todayKey()} />;
}
