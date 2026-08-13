import { auth } from "@/lib/auth";
import AttendanceSummaryWorkspace from "@/components/attendance/AttendanceSummaryWorkspace";

export const dynamic = "force-dynamic";

export default async function PendingAttendancePage() {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | "sub-admin";
  return <AttendanceSummaryWorkspace role={role} kind="pending" />;
}
