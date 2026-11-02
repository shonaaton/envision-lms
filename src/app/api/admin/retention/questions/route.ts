import { NextResponse } from "next/server";
import { createQuestion, listQuestions } from "@/lib/retention/familyQuestions";
import { requireRetentionAccess, retentionActor } from "@/lib/retention/retentionAccess";
import { errorMessage } from "@/lib/retention/routeErrors";

export const dynamic = "force-dynamic";

/** The call question bank; `?all=1` includes switched-off questions. */
export async function GET(req: Request) {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ questions: await listQuestions({ includeInactive: new URL(req.url).searchParams.get("all") === "1" }) });
}

export async function POST(req: Request) {
  const session = await requireRetentionAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await createQuestion(await req.json().catch(() => ({})), retentionActor(session).id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save the question.") }, { status: 400 });
  }
}
