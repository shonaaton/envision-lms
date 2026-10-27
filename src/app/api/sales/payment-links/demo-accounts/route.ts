import { NextResponse } from "next/server";
import { searchDemoAccounts } from "@/lib/payments/salesPaymentLinks";
import { forbidden, paymentLinkViewer } from "../http";

export const dynamic = "force-dynamic";

/** Demo accounts for the "New payment link" picker; a salesperson sees only their own leads. */
export async function GET(req: Request) {
  const access = await paymentLinkViewer();
  if (!access?.viewer.permissions.create) return forbidden();
  const q = new URL(req.url).searchParams.get("q") || "";
  return NextResponse.json({ accounts: await searchDemoAccounts(access.actor, q) });
}
