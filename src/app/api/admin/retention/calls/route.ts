import { NextResponse } from "next/server";
import { callHistory, logFamilyCall } from "@/lib/retention/familyCallService";
import { requireRetentionAccess, retentionActor } from "@/lib/retention/retentionAccess";
import { errorMessage } from "@/lib/retention/routeErrors";

export const dynamic = "force-dynamic";

/** Call history: `?student=` (that family), `q`, `month`, `outcome`, `caller`, `page`. */
export async function GET(req: Request) {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  return NextResponse.json(await callHistory({
    studentId: params.get("student") || undefined,
    q: params.get("q") || undefined,
    month: params.get("month") || undefined,
    outcome: params.get("outcome") || undefined,
    callerId: params.get("caller") || undefined,
    page: Number(params.get("page")) || 1,
  }));
}

/** Logs one call to a family and does what it implies (tasks, flag, messages). */
export async function POST(req: Request) {
  const session = await requireRetentionAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await logFamilyCall(body, retentionActor(session)));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save the call.") }, { status: 400 });
  }
}
