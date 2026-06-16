import { auth } from "@/lib/auth";
import AttendanceWorkspace from "@/components/attendance/AttendanceWorkspace";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin";
  return <AttendanceWorkspace role={role} />;
}
