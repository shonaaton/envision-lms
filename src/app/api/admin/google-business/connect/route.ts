import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { googleBusinessOAuthUrl } from "@/lib/googleBusinessAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const state = randomUUID();
  const response = NextResponse.redirect(googleBusinessOAuthUrl(state));
  response.cookies.set("google_business_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
