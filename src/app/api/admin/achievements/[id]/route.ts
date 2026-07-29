import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { normalizeAchievement, serializeAchievement } from "@/lib/achievements";
import { Achievement } from "@/models/Achievement";

export const dynamic = "force-dynamic";

function adminId(session: any) {
  if (session?.user?.role !== "admin") return null;
  return session.user.id as string;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const actorId = adminId(session);
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const achievement: any = await Achievement.findById(params.id);
  if (!achievement) return NextResponse.json({ error: "Achievement not found." }, { status: 404 });

  achievement.set(normalizeAchievement(await req.json(), actorId));
  await achievement.save();

  await recordActivity({
    actor: actorId,
    type: "achievement.updated",
    label: `Updated achievement for ${achievement.studentName}`,
    entityType: "Achievement",
    entityId: achievement._id.toString(),
    metadata: { tournamentName: achievement.tournamentName, isPublished: achievement.isPublished, isFeatured: achievement.isFeatured },
  });

  return NextResponse.json(serializeAchievement(achievement));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const actorId = adminId(session);
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const achievement: any = await Achievement.findByIdAndDelete(params.id);
  if (!achievement) return NextResponse.json({ error: "Achievement not found." }, { status: 404 });

  await recordActivity({
    actor: actorId,
    type: "achievement.deleted",
    label: `Deleted achievement for ${achievement.studentName}`,
    entityType: "Achievement",
    entityId: achievement._id.toString(),
    metadata: { tournamentName: achievement.tournamentName },
  });

  return NextResponse.json({ ok: true });
}
