import { NextResponse } from "next/server";
import { writeRuntimeLog } from "@/lib/runtimeLogger";

type ClientErrorPayload = {
  source?: string;
  message?: string;
  digest?: string;
  pathname?: string;
  stack?: string;
};

export async function POST(request: Request) {
  let payload: ClientErrorPayload | null = null;

  try {
    payload = (await request.json()) as ClientErrorPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  writeRuntimeLog({
    source: payload?.source || "client-error-boundary",
    message: payload?.message || "Client error boundary reported an application error.",
    pathname: payload?.pathname,
    digest: payload?.digest,
    error: payload?.stack ? new Error(payload.stack) : undefined,
    metadata: {
      runtime: "browser",
    },
  });

  return NextResponse.json({ ok: true });
}
