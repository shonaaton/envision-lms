import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { ACADEMY_FAVICON_URL, ACADEMY_LOGO_URL } from "@/lib/branding";

export const dynamic = "force-dynamic";

export async function GET() {
  await dbConnect();
  const settings: any = await getAcademySettings();
  return NextResponse.json({
    academyName: settings.academyName,
    logoUrl: ACADEMY_LOGO_URL,
    faviconUrl: ACADEMY_FAVICON_URL,
  });
}
