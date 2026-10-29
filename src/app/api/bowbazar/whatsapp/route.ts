import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { branchConversations } from "@/lib/branch/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("whatsapp");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ conversations: await branchConversations(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
