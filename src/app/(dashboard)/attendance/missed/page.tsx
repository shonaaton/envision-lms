import { auth } from "@/lib/auth";
import MissedAttendanceWorkspace from "@/components/attendance/MissedAttendanceWorkspace";

export const dynamic = "force-dynamic";

export default async function MissedAttendancePage() {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | "sub-admin";
  return <MissedAttendanceWorkspace role={role} />;
}
