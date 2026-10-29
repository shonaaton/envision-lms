import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { branchConversation, replyToFamily } from "@/lib/branch/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { phone: string } }) {
  const access = await requireBranchAccess("whatsapp");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await branchConversation(access.branch, decodeURIComponent(params.phone)));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** `{ text }`: a reply inside the 24-hour window. */
export async function POST(req: Request, { params }: { params: { phone: string } }) {
  const access = await requireBranchAccess("whatsapp");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await replyToFamily(access.branch, decodeURIComponent(params.phone), await req.json(), { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
