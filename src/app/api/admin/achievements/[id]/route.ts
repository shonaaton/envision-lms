import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { normalizeAchievement, serializeAchievement } from "@/lib/achievements";
import { Achievement } from "@/models/Achievement";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdminApiAccess(req, "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session.user as any).id as string;

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

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdminApiAccess(req, "delete");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session.user as any).id as string;

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
