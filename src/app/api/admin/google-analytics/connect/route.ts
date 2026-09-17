import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { googleAnalyticsOAuthUrl } from "@/lib/googleAnalyticsAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const propertyId = new URL(req.url).searchParams.get("propertyId")?.trim() || "";
  if (!/^\d+$/.test(propertyId)) return NextResponse.json({ error: "Enter a valid numeric GA4 Property ID." }, { status: 400 });

  const state = `${randomUUID()}:${propertyId}`;
  const response = NextResponse.redirect(googleAnalyticsOAuthUrl(state));
  response.cookies.set("google_analytics_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60, path: "/",
  });
  return response;
}
