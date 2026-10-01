import "server-only";
import { NextResponse } from "next/server";
import { PtmError } from "./ptmService";
export function ptmErrorResponse(error: unknown) {
  if (error instanceof PtmError) return NextResponse.json({ error: error.message }, { status: error.status });
  if ((error as any)?.issues?.[0]?.message) return NextResponse.json({ error: (error as any).issues[0].message }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  if ((error as any)?.code === 11000) return NextResponse.json({ error: "You already have an open PTM request." }, { status: 409 });
  console.error("PTM request failed", error);
  return NextResponse.json({ error: "Could not process the PTM request." }, { status: 500 });
}
