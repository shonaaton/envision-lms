import { NextResponse } from "next/server";
import { writeRuntimeLog } from "@/lib/runtimeLogger";
import { consumeRateLimit, getClientIp } from "@/lib/requestSecurity";

type ClientErrorPayload = {
  source?: string;
  message?: string;
  digest?: string;
  pathname?: string;
  stack?: string;
};

/**
 * Anyone can call this - the error boundary reports from signed-out pages too -
 * so each address gets a few reports a minute and each field is capped. It used
 * to write whatever it was sent, as often as it was sent, into the runtime log.
 */
const REPORTS_PER_MINUTE_PER_IP = 20;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);

export async function POST(request: Request) {
  if (!consumeRateLimit(`client-errors:ip:${getClientIp(request.headers)}`, REPORTS_PER_MINUTE_PER_IP, 60_000).allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let payload: ClientErrorPayload | null = null;

  try {
    payload = (await request.json()) as ClientErrorPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const stack = text(payload?.stack, 4000);
  writeRuntimeLog({
    source: text(payload?.source, 100) || "client-error-boundary",
    message: text(payload?.message, 1000) || "Client error boundary reported an application error.",
    pathname: text(payload?.pathname, 300),
    digest: text(payload?.digest, 100),
    error: stack ? new Error(stack) : undefined,
    metadata: {
      runtime: "browser",
    },
  });

  return NextResponse.json({ ok: true });
}
