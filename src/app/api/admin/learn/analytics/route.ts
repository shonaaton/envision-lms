import { NextResponse } from "next/server";
import { requireLearnAuthoring } from "@/lib/learning/authoringAccess";
import { getLearningAnalytics } from "@/lib/learning/adminService";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireLearnAuthoring("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getLearningAnalytics());
}
