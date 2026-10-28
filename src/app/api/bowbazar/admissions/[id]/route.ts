import { NextResponse } from "next/server";
import { approveAdmission, cancelAdmission, rejectAdmission, resendAdmission } from "@/lib/branch/admissions";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** `action`: "resend", "cancel", "approve" (details, slots, fee) or "reject" (reason). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    if (body?.action === "resend") return NextResponse.json(await resendAdmission(access.branch, params.id, actor, req));
    if (body?.action === "cancel") {
      await cancelAdmission(access.branch, params.id, actor);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "approve") return NextResponse.json(await approveAdmission(access.branch, params.id, body, actor, req));
    if (body?.action === "reject") {
      await rejectAdmission(access.branch, params.id, body, actor);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
