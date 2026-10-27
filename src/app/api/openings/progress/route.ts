import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canOpenChapter, openingAccessFor } from "@/lib/openings/access";
import { getOpening } from "@/lib/openings/content";
import { recordOpeningProgress } from "@/lib/openings/progress";

export const dynamic = "force-dynamic";

/** The openings player reports the step a student reached in a chapter. */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const opening = getOpening(String(body?.opening || ""));
  const chapter = opening?.chapters.find((item) => item.slug === String(body?.chapter || ""));
  if (!opening || !chapter) return NextResponse.json({ error: "Unknown chapter" }, { status: 404 });

  const access = await openingAccessFor(user, opening.slug);
  if (!canOpenChapter(access, chapter)) return NextResponse.json({ error: "This chapter is locked" }, { status: 403 });

  const step = Math.min(Math.max(0, Math.floor(Number(body?.step) || 0)), chapter.steps.length - 1);
  // Completion is only believed on the last step.
  const completed = body?.completed === true && step === chapter.steps.length - 1;
  await recordOpeningProgress({ userId: user.id, opening: opening.slug, chapter: chapter.slug, step, completed });
  return NextResponse.json({ ok: true });
}
