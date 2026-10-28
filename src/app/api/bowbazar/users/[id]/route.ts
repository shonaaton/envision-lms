import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { deleteBranchUser, resetBranchUserPassword, setBranchUserActive, updateBranchUser } from "@/lib/branch/users";

export const dynamic = "force-dynamic";

/** `action`: "update" (name, email, phone, branchRole), "resetPassword" or "setActive" (active, reason). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    if (body?.action === "resetPassword") return NextResponse.json(await resetBranchUserPassword(access.branch, params.id, actor));
    if (body?.action === "setActive") {
      await setBranchUserActive(access.branch, params.id, body, actor);
      return NextResponse.json({ ok: true });
    }
    await updateBranchUser(access.branch, params.id, body, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** Permanent: `{ confirmName }` must match the account's full name. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    await deleteBranchUser(access.branch, params.id, await req.json().catch(() => ({})), actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
