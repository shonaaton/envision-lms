import { dbConnect } from "@/lib/db";
import { GoogleBusinessIntegration } from "@/models/GoogleBusinessIntegration";

const scope = "https://www.googleapis.com/auth/business.manage";

export function googleBusinessRedirectUri() {
  return (
    process.env.GOOGLE_BUSINESS_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")}/api/auth/google-business/callback`
  );
}

export function googleBusinessOAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_BUSINESS_CLIENT_ID is not set.");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleBusinessRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeToken(params: Record<string, string>) {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Business OAuth client is not configured.");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    ...params,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description || data?.error || "Google OAuth token exchange failed.");
  return data;
}

export async function exchangeGoogleBusinessCode(code: string) {
  return exchangeToken({
    code,
    redirect_uri: googleBusinessRedirectUri(),
    grant_type: "authorization_code",
  });
}

export async function refreshGoogleBusinessAccessToken(refreshToken: string) {
  return exchangeToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function getGoogleBusinessAccessToken() {
  await dbConnect();
  const integration: any = await GoogleBusinessIntegration.findOne({ singletonKey: "google-business" });
  if (!integration?.refreshToken) return process.env.GOOGLE_BUSINESS_ACCESS_TOKEN || "";

  const expiresAt = integration.accessTokenExpiresAt ? new Date(integration.accessTokenExpiresAt).getTime() : 0;
  if (integration.accessToken && expiresAt > Date.now() + 2 * 60 * 1000) return integration.accessToken;

  const token = await refreshGoogleBusinessAccessToken(integration.refreshToken);
  integration.accessToken = token.access_token;
  integration.accessTokenExpiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000);
  integration.tokenType = token.token_type;
  if (token.scope) integration.scope = token.scope;
  await integration.save();
  return integration.accessToken;
}

async function googleJson(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Google request failed: ${url}`);
  return data;
}

function reviewParent(accountName: string, locationName: string) {
  const accountId = accountName.replace(/^accounts\//, "");
  const locationId = locationName.replace(/^locations\//, "").replace(/^accounts\/[^/]+\/locations\//, "");
  return `accounts/${accountId}/locations/${locationId}`;
}

function addressText(address: any) {
  const lines = Array.isArray(address?.addressLines) ? address.addressLines.join(", ") : "";
  return [lines, address?.locality, address?.administrativeArea, address?.postalCode].filter(Boolean).join(", ");
}

export async function discoverGoogleBusinessLocations(accessToken: string) {
  const accountsResponse = await googleJson("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", accessToken);
  const accounts = accountsResponse.accounts || [];
  const locations: Array<{
    accountName: string;
    locationName: string;
    reviewParent: string;
    title?: string;
    placeId?: string;
    address?: string;
  }> = [];

  for (const account of accounts) {
    const accountName = account.name;
    if (!accountName) continue;
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
    url.searchParams.set("readMask", "name,title,metadata,storefrontAddress");
    url.searchParams.set("pageSize", "100");
    const data = await googleJson(url.toString(), accessToken);
    for (const location of data.locations || []) {
      if (!location.name) continue;
      locations.push({
        accountName,
        locationName: location.name,
        reviewParent: reviewParent(accountName, location.name),
        title: location.title,
        placeId: location.metadata?.placeId || location.metadata?.mapsUri,
        address: addressText(location.storefrontAddress),
      });
    }
  }

  return {
    accountNames: accounts.map((account: any) => account.name).filter(Boolean),
    locations,
  };
}
