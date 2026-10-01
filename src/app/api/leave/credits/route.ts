import { NextResponse } from "next/server";
import { resolveLeaveViewer } from "@/lib/leave/leaveAccess";
import { forbidden, leaveErrorResponse } from "@/lib/leave/leaveHttp";
import { applyCreditAction, creditLedger, listCreditAccounts } from "@/lib/leave/leaveService";

export const dynamic = "force-dynamic";

/** Admins: every eligible staff member's credits, or one person's ledger with `?user=`. Staff may read their own ledger. */
export async function GET(req: Request) {
  const viewer = await resolveLeaveViewer();
  if (!viewer) return forbidden();
  try {
    const user = new URL(req.url).searchParams.get("user");
    if (user) return NextResponse.json(await creditLedger(viewer, user));
    return NextResponse.json(await listCreditAccounts(viewer));
  } catch (error) {
    return leaveErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const viewer = await resolveLeaveViewer();
  if (!viewer) return forbidden();
  try {
    return NextResponse.json(await applyCreditAction(viewer, await req.json()));
  } catch (error) {
    return leaveErrorResponse(error);
  }
}
