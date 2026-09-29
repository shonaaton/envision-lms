import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import CalendarWorkspace from "@/components/calendar/CalendarWorkspace";
import { loadCalendarPayload } from "@/lib/calendarEvents";
import { canAccessFeature } from "@/lib/featureAccess";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = ((session.user as any)?.role || "student") as "student" | "instructor" | "admin" | "sub-admin";
  const userId = (session?.user as any)?.id;
  const canJoin = await canAccessFeature("classrooms", session.user as any, "join");

  await dbConnect();

  const payload = await loadCalendarPayload(role, userId, canJoin);

  return <CalendarWorkspace role={role} title={payload.title} subtitle={payload.subtitle} events={payload.events} />;
}
