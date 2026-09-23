import { NextResponse } from "next/server";
import { requireLearnAuthoring } from "@/lib/learning/authoringAccess";
import { validateExerciseDraft } from "@/lib/learning/adminService";
import { sanitizeExerciseInput } from "@/lib/learning/exerciseInput";

export const dynamic = "force-dynamic";

/** Dry run for the authoring screen: check a draft without saving anything. */
export async function POST(request: Request) {
  const session = await requireLearnAuthoring("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Nothing to check" }, { status: 400 });

  const draft = sanitizeExerciseInput(body);
  return NextResponse.json({ draft, report: validateExerciseDraft(draft) });
}
