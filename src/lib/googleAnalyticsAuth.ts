import "server-only";

import { resolvePublicAppUrl } from "@/lib/appUrl";
import { dbConnect } from "@/lib/db";
import { GoogleAnalyticsIntegration } from "@/models/GoogleAnalyticsIntegration";

const scope = "https://www.googleapis.com/auth/analytics.readonly";

export function googleAnalyticsRedirectUri() {
  return process.env.GOOGLE_ANALYTICS_REDIRECT_URI || `${resolvePublicAppUrl()}/api/auth/google-analytics/callback`;
}

export function googleAnalyticsOAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_ANALYTICS_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_ANALYTICS_CLIENT_ID is not set.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleAnalyticsRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeToken(params: Record<string, string>) {
  const clientId = process.env.GOOGLE_ANALYTICS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ANALYTICS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Analytics OAuth client is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error_description || data?.error || "Google OAuth token exchange failed.");
  return data;
}

export function exchangeGoogleAnalyticsCode(code: string) {
  return exchangeToken({ code, redirect_uri: googleAnalyticsRedirectUri(), grant_type: "authorization_code" });
}

export function refreshGoogleAnalyticsAccessToken(refreshToken: string) {
  return exchangeToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export async function getGoogleAnalyticsIntegration() {
  await dbConnect();
  return GoogleAnalyticsIntegration.findOne({ singletonKey: "google-analytics" }).lean();
}

export async function getGoogleAnalyticsAccessToken() {
  await dbConnect();
  const integration: any = await GoogleAnalyticsIntegration.findOne({ singletonKey: "google-analytics" });
  if (!integration?.refreshToken || !integration?.propertyId) throw new Error("Google Analytics has not been connected.");
  const expiresAt = integration.accessTokenExpiresAt ? new Date(integration.accessTokenExpiresAt).getTime() : 0;
  if (integration.accessToken && expiresAt > Date.now() + 2 * 60 * 1000) {
    return { accessToken: integration.accessToken as string, propertyId: integration.propertyId as string };
  }
  const token = await refreshGoogleAnalyticsAccessToken(integration.refreshToken);
  integration.accessToken = token.access_token;
  integration.accessTokenExpiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000);
  integration.tokenType = token.token_type;
  if (token.scope) integration.scope = token.scope;
  await integration.save();
  return { accessToken: integration.accessToken as string, propertyId: integration.propertyId as string };
}
