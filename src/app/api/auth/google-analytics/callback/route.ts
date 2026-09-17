import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { exchangeGoogleAnalyticsCode } from "@/lib/googleAnalyticsAuth";
import { GoogleAnalyticsIntegration } from "@/models/GoogleAnalyticsIntegration";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = req.headers.get("cookie") || "";
  const expectedState = cookie.match(/(?:^|;\s*)google_analytics_oauth_state=([^;]+)/)?.[1];
  if (!code) return NextResponse.json({ error: "Missing Google OAuth code." }, { status: 400 });
  if (!state || !expectedState || decodeURIComponent(expectedState) !== state) {
    return NextResponse.json({ error: "Google OAuth state mismatch. Please try connecting again." }, { status: 400 });
  }
  const propertyId = state.split(":")[1] || "";
  if (!/^\d+$/.test(propertyId)) return NextResponse.json({ error: "Invalid GA4 Property ID." }, { status: 400 });
  try {
    const token = await exchangeGoogleAnalyticsCode(code);
    if (!token.refresh_token) return NextResponse.json({ error: "Google did not return a refresh token. Reconnect and approve consent." }, { status: 400 });
    await dbConnect();
    await GoogleAnalyticsIntegration.updateOne(
      { singletonKey: "google-analytics" },
      { $set: { propertyId, refreshToken: token.refresh_token, accessToken: token.access_token, accessTokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000), scope: token.scope, tokenType: token.token_type, connectedBy: user.id, connectedAt: new Date(), lastReportError: "" } },
      { upsert: true }
    );
    const response = NextResponse.redirect(new URL("/admin/google-analytics?connected=1", req.url));
    response.cookies.delete("google_analytics_oauth_state");
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not connect Google Analytics." }, { status: 400 });
  }
}
