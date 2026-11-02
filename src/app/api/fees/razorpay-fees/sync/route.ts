import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { isFeesManager, requireFeesAccess } from "@/lib/feesAccess";
import { syncMissingRazorpayFees } from "@/lib/payments/razorpayCharges";

export const dynamic = "force-dynamic";

/** Asks Razorpay for the fee on payments recorded without one (the dashboard's "Fetch missing fees"). */
export async function POST() {
  const session = await auth();
  if (!isFeesManager((session?.user as any)?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await requireFeesAccess("view", "feeDashboard"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const result = await syncMissingRazorpayFees();
  if (!result.configured) {
    return NextResponse.json({ error: "Razorpay keys are not configured on this server." }, { status: 400 });
  }
  return NextResponse.json(result);
}
