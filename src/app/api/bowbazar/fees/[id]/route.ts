import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { adjustBill, recordPayment, removePayment } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

/** `action`: "pay", "removePayment" (with `paymentId`) or "adjust". */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    if (body?.action === "pay") {
      return NextResponse.json(await recordPayment(access.branch, params.id, body, { id: access.actorId, name: access.user.name }));
    }
    if (body?.action === "removePayment") return NextResponse.json(await removePayment(access.branch, params.id, String(body.paymentId || "")));
    return NextResponse.json(await adjustBill(access.branch, params.id, body));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
