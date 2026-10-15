import { NextResponse } from "next/server";
import { cancelHoliday } from "@/lib/holidays/holidayService";
import { kickHolidayAnnouncements } from "@/lib/holidays/holidayNotifications";
import { forbidden, holidayErrorResponse, requireHolidayAccess } from "@/lib/holidays/holidayHttp";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireHolidayAccess(req, "edit");
  if (!session) return forbidden();
  try {
    const body = await req.json();
    if (body?.action !== "cancel") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const result = await cancelHoliday(params.id, body, String((session.user as any).id));
    kickHolidayAnnouncements();
    return NextResponse.json(result);
  } catch (error) {
    return holidayErrorResponse(error);
  }
}
