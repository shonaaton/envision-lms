import { NextResponse } from "next/server";
import { markTopicsDone } from "@/lib/branch/courses";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/**
 * Marks topics of a course level done by hand, for what students learnt before
 * the portal: `{ studentIds, levelId, done: topicIds, undone: topicIds, replace }`.
 */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await markTopicsDone(access.branch, await req.json(), { id: access.actorId, name: String(access.user.name || "") }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
