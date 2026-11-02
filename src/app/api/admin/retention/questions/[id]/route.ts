import { NextResponse } from "next/server";
import { updateQuestion } from "@/lib/retention/familyQuestions";
import { requireRetentionAccess, retentionActor } from "@/lib/retention/retentionAccess";
import { errorMessage } from "@/lib/retention/routeErrors";

export const dynamic = "force-dynamic";

/** Edit a question, switch it off (`active: false`) or move it (`order`). Questions are never deleted: old calls quote them. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireRetentionAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await updateQuestion(params.id, await req.json().catch(() => ({})), retentionActor(session).id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save the question.") }, { status: 400 });
  }
}
