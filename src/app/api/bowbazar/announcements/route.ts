import { NextResponse } from "next/server";
import { listAnnouncements, sendAnnouncement } from "@/lib/branch/comms";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ announcements: await listAnnouncements(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** `{ title, message, audience: "all" | "slots" | "students", slotIds, studentIds }` */
export async function POST(req: Request) {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await sendAnnouncement(access.branch, await req.json(), { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
