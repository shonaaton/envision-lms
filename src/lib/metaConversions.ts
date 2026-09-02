import crypto from "crypto";

type MetaConversionUserData = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type SendMetaConversionEventInput = {
  eventName: "CompleteRegistration" | "Schedule";
  eventId: string;
  request: Request;
  userData?: MetaConversionUserData;
};

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function hash(value?: string | null) {
  const normalized = normalize(value);
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex") : undefined;
}

function splitName(name?: string | null) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0], lastName: undefined };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function cookieValue(cookieHeader: string | null, name: string) {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function eventSourceUrl(req: Request) {
  return req.headers.get("referer") || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || undefined;
}

export async function sendMetaConversionEvent({ eventName, eventId, request, userData }: SendMetaConversionEventInput) {
  const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return;

  const cookieHeader = request.headers.get("cookie");
  const derivedName = splitName(userData?.name);
  const firstName = userData?.firstName || derivedName.firstName;
  const lastName = userData?.lastName || derivedName.lastName;
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: eventSourceUrl(request),
        user_data: {
          em: hash(userData?.email),
          ph: hash(userData?.phone),
          fn: hash(firstName),
          ln: hash(lastName),
          client_user_agent: request.headers.get("user-agent") || undefined,
          fbp: cookieValue(cookieHeader, "_fbp"),
          fbc: cookieValue(cookieHeader, "_fbc"),
        },
      },
    ],
  };

  const response = await fetch(`https://graph.facebook.com/v25.0/${pixelId}/events?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Meta CAPI ${eventName} failed: ${response.status} ${message}`);
  }
}
