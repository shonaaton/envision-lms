import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { normalizeAchievement, seedVerifiedAchievements, serializeAchievement } from "@/lib/achievements";
import { Achievement } from "@/models/Achievement";

export const dynamic = "force-dynamic";

function adminId(session: any) {
  if (session?.user?.role !== "admin") return null;
  return session.user.id as string;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!adminId(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const student = url.searchParams.get("student")?.trim();
  const tournament = url.searchParams.get("tournament")?.trim();
  const result = url.searchParams.get("result")?.trim();
  const year = url.searchParams.get("year")?.trim();
  const location = url.searchParams.get("location")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const level = url.searchParams.get("level")?.trim();
  const visibility = url.searchParams.get("visibility")?.trim();

  await dbConnect();
  const filter: any = {};
  if (q) filter.$text = { $search: q };
  if (student) filter.studentName = new RegExp(student.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (tournament) filter.tournamentName = new RegExp(tournament.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (result) filter.result = new RegExp(result.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (year) filter.year = year;
  if (location) filter.tournamentLocation = new RegExp(location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (category) filter.category = category;
  if (level) filter.achievementLevel = level;
  if (visibility === "published") filter.isPublished = { $ne: false };
  if (visibility === "hidden") filter.isPublished = false;

  const achievements = await Achievement.find(filter).sort({ isFeatured: -1, displayOrder: 1, createdAt: -1 }).limit(300).lean();
  return NextResponse.json(achievements.map(serializeAchievement));
}

export async function POST(req: Request) {
  const session = await auth();
  const actorId = adminId(session);
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const input = await req.json();
  await dbConnect();

  if (input?.action === "seed") {
    const achievements = await seedVerifiedAchievements(actorId);
    await recordActivity({
      actor: actorId,
      type: "achievement.seeded",
      label: `Imported ${achievements.length} verified achievement records`,
      entityType: "Achievement",
      metadata: { count: achievements.length },
    });
    return NextResponse.json(achievements);
  }

  const body = normalizeAchievement(input, actorId);
  if (!body.studentName) return NextResponse.json({ error: "Student name is required." }, { status: 400 });
  if (!body.tournamentName) return NextResponse.json({ error: "Tournament name is required." }, { status: 400 });
  if (!body.result) return NextResponse.json({ error: "Result is required." }, { status: 400 });
  if (!body.achievementImageUrl) return NextResponse.json({ error: "Achievement image URL is required." }, { status: 400 });

  const created = await Achievement.create({ ...body, createdBy: actorId });
  await recordActivity({
    actor: actorId,
    type: "achievement.created",
    label: `Added achievement for ${created.studentName}`,
    entityType: "Achievement",
    entityId: created._id.toString(),
    metadata: { tournamentName: created.tournamentName, result: created.result },
  });
  return NextResponse.json(serializeAchievement(created));
}
