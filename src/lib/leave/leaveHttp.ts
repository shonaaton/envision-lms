import "server-only";
import { NextResponse } from "next/server";
import { LeaveError } from "./leaveService";

export function leaveErrorResponse(error: unknown) {
  if (error instanceof LeaveError) return NextResponse.json({ error: error.message }, { status: error.status });
  if ((error as any)?.issues?.[0]?.message) return NextResponse.json({ error: (error as any).issues[0].message }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  if ((error as any)?.code === 11000) return NextResponse.json({ error: "You already have an open leave request for this day. Cancel it first to apply again." }, { status: 409 });
  console.error("Leave request failed", error);
  return NextResponse.json({ error: "Could not process the leave request." }, { status: 500 });
}

export const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
