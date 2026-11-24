import { NextResponse } from "next/server";
import { forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import { listApplications, parseApplicationFilters } from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getCareersActor("view");
  if (!actor) return forbidden();
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return NextResponse.json(await listApplications(parseApplicationFilters(params)), { headers: { "Cache-Control": "no-store" } });
}
