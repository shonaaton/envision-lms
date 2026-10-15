import { NextResponse } from "next/server";
import { declareHoliday, listHolidays, previewHoliday } from "@/lib/holidays/holidayService";
import { kickHolidayAnnouncements } from "@/lib/holidays/holidayNotifications";
import { forbidden, holidayErrorResponse, requireHolidayAccess } from "@/lib/holidays/holidayHttp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireHolidayAccess(req, "view");
  if (!session) return forbidden();
  try {
    return NextResponse.json({ holidays: await listHolidays() });
  } catch (error) {
    return holidayErrorResponse(error);
  }
}

/** `dryRun: true` returns the preview; otherwise the holiday is declared. */
export async function POST(req: Request) {
  const session = await requireHolidayAccess(req, "create");
  if (!session) return forbidden();
  try {
    const body = await req.json();
    if (body?.dryRun) return NextResponse.json({ preview: await previewHoliday(body) });
    const result = await declareHoliday(body, String((session.user as any).id));
    kickHolidayAnnouncements();
    return NextResponse.json(result);
  } catch (error) {
    return holidayErrorResponse(error);
  }
}
