import { NextResponse } from "next/server";
import { searchAttachableStudents } from "@/lib/payments/salesPaymentLinks";
import { forbidden, paymentLinkViewer } from "../http";

export const dynamic = "force-dynamic";

/** Student lookup for attaching a paid link; only for those who may attach. */
export async function GET(req: Request) {
  const access = await paymentLinkViewer();
  if (!access?.viewer.permissions.attach) return forbidden();
  const q = new URL(req.url).searchParams.get("q") || "";
  return NextResponse.json({ students: await searchAttachableStudents(q) });
}
