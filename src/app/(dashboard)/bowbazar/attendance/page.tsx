import AttendanceClient from "@/components/bowbazar/AttendanceClient";
import { requireBranchPage } from "@/lib/branch/page";
import { todayKey } from "@/lib/branch/rules";

export const dynamic = "force-dynamic";

export default async function BowbazarAttendancePage({ searchParams }: { searchParams?: { slot?: string } }) {
  const { can } = await requireBranchPage("attendance");
  // "Mark now" on the Overview names today's class to open.
  const slot = typeof searchParams?.slot === "string" && /^[a-f0-9]{24}$/.test(searchParams.slot) ? searchParams.slot : "";
  // Today on the academy's calendar, not the browser's.
  return <AttendanceClient can={can} today={todayKey()} initialSlot={slot} />;
}
