import "server-only";
import { NextResponse } from "next/server";
import { ClassMonitorError } from "./classMonitorService";

export function classMonitorErrorResponse(error: unknown) {
  if (error instanceof ClassMonitorError) return NextResponse.json({ error: error.message }, { status: error.status });
  if ((error as any)?.issues?.[0]?.message) return NextResponse.json({ error: (error as any).issues[0].message }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  console.error("Class Monitor request failed", error);
  return NextResponse.json({ error: "Could not complete the Class Monitor request." }, { status: 500 });
}

export const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
