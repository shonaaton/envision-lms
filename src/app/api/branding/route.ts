import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { ACADEMY_FAVICON_URL, ACADEMY_LOGO_URL } from "@/lib/branding";

export const dynamic = "force-dynamic";

export async function GET() {
  let academyName = "Envision Chess Academy";
  try {
    await dbConnect();
    const settings: any = await getAcademySettings();
    academyName = settings.academyName || academyName;
  } catch (error) {
    console.error("Branding settings unavailable; using default branding", error);
  }
  return NextResponse.json({
    academyName,
    logoUrl: ACADEMY_LOGO_URL,
    faviconUrl: ACADEMY_FAVICON_URL,
  });
}
