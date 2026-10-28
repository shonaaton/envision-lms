import { NextResponse } from "next/server";
import { getRegister, saveRegister } from "@/lib/branch/attendance";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

type Params = { params: { slotId: string; date: string } };

export async function GET(_req: Request, { params }: Params) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await getRegister(access.branch, params.slotId, params.date));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** Saves the whole register: `{ rows: [{ studentId, status, topic, note, homeworkNote }] }`. */
export async function PUT(req: Request, { params }: Params) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    return NextResponse.json(await saveRegister(access.branch, params.slotId, params.date, body, actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
