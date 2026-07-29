import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { exchangeGoogleBusinessCode, discoverGoogleBusinessLocations } from "@/lib/googleBusinessAuth";
import { syncGoogleReviews } from "@/lib/googleReviews";
import { GoogleBusinessIntegration } from "@/models/GoogleBusinessIntegration";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = user.id;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = req.headers.get("cookie") || "";
  const expectedState = cookie.match(/(?:^|;\s*)google_business_oauth_state=([^;]+)/)?.[1];

  if (!code) return NextResponse.json({ error: "Missing Google OAuth code." }, { status: 400 });
  if (!state || !expectedState || decodeURIComponent(expectedState) !== state) {
    return NextResponse.json({ error: "Google OAuth state mismatch. Please try connecting again." }, { status: 400 });
  }

  try {
    const token = await exchangeGoogleBusinessCode(code);
    if (!token.refresh_token) {
      return NextResponse.json({ error: "Google did not return a refresh token. Reconnect with consent enabled." }, { status: 400 });
    }
    const discovered = await discoverGoogleBusinessLocations(token.access_token);

    await dbConnect();
    await GoogleBusinessIntegration.updateOne(
      { singletonKey: "google-business" },
      {
        $set: {
          refreshToken: token.refresh_token,
          accessToken: token.access_token,
          accessTokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000),
          scope: token.scope,
          tokenType: token.token_type,
          connectedBy: actorId,
          connectedAt: new Date(),
          accountNames: discovered.accountNames,
          locations: discovered.locations,
          lastSyncError: "",
        },
      },
      { upsert: true }
    );

    let syncFailed = false;
    try {
      await syncGoogleReviews();
    } catch (syncError: any) {
      syncFailed = true;
      await GoogleBusinessIntegration.updateOne(
        { singletonKey: "google-business" },
        { $set: { lastSyncError: syncError?.message || "Initial Google review sync failed." } }
      );
    }

    const response = NextResponse.redirect(
      new URL(`/admin/settings?googleBusiness=connected${syncFailed ? "&sync=failed" : ""}`, req.url)
    );
    response.cookies.delete("google_business_oauth_state");
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not connect Google Business Profile." }, { status: 400 });
  }
}
