import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { sendWelcomeLogins } from "@/lib/branch/logins";

export const dynamic = "force-dynamic";

/** Sends each chosen family its welcome message: the username and a link to set the password. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    return NextResponse.json(await sendWelcomeLogins(access.branch, body?.studentIds, { id: access.actorId, name: String(access.user.name || "") }, req));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
