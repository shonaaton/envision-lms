import { NextResponse } from "next/server";
import { requireChessSession } from "@/lib/chess/access";
import { canAccessFeature } from "@/lib/featureAccess";
import { getAdminChessStudents, getTeacherChessStudents } from "@/lib/chess/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireChessSession("view");
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const role = (session.user as any).role;
  const url = new URL(req.url);
  if (role === "instructor") {
    if (!(await canAccessFeature("playerAnalytics", session.user as any, "view_assigned"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ students: await getTeacherChessStudents((session.user as any).id) });
  }
  if (await canAccessFeature("playerAnalytics", session.user as any, "view_all")) {
    return NextResponse.json({ students: await getAdminChessStudents(url.searchParams.get("q") || undefined, url.searchParams.get("status") || undefined) });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
