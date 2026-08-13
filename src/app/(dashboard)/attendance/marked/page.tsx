import { auth } from "@/lib/auth";
import AttendanceSummaryWorkspace from "@/components/attendance/AttendanceSummaryWorkspace";

export const dynamic = "force-dynamic";

export default async function MarkedAttendancePage() {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | "sub-admin";
  return <AttendanceSummaryWorkspace role={role} kind="marked" />;
}
