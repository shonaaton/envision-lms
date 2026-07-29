import { dbConnect } from "@/lib/db";
import { seededAchievements, type AchievementRecord } from "@/lib/achievementData";
import { Achievement } from "@/models/Achievement";

export function serializeAchievement(item: any): AchievementRecord {
  const source = typeof item.toObject === "function" ? item.toObject() : item;
  return {
    _id: source._id?.toString(),
    studentName: source.studentName || "",
    studentPhotoUrl: source.studentPhotoUrl || "",
    achievementImageUrl: source.achievementImageUrl || "",
    tournamentName: source.tournamentName || "",
    result: source.result || "",
    category: source.category || "Tournament",
    tournamentLocation: source.tournamentLocation || "Not specified",
    year: source.year || "Not specified",
    achievementLevel: source.achievementLevel || "Other",
    shortDescription: source.shortDescription || "",
    isFeatured: source.isFeatured === true,
    displayOrder: Number(source.displayOrder || 0),
    isPublished: source.isPublished !== false,
    sourceImageName: source.sourceImageName || "",
  };
}

export function normalizeAchievement(input: any, actorId?: string) {
  const body = {
    studentName: String(input.studentName || "").trim(),
    studentPhotoUrl: String(input.studentPhotoUrl || "").trim(),
    achievementImageUrl: String(input.achievementImageUrl || input.imageUrl || "").trim(),
    tournamentName: String(input.tournamentName || "").trim(),
    result: String(input.result || "").trim(),
    category: String(input.category || "Tournament").trim() || "Tournament",
    tournamentLocation: String(input.tournamentLocation || "Not specified").trim() || "Not specified",
    year: String(input.year || "Not specified").trim() || "Not specified",
    achievementLevel: ["District", "State", "National", "International", "Rating", "Other"].includes(input.achievementLevel)
      ? input.achievementLevel
      : "Other",
    shortDescription: String(input.shortDescription || "").trim(),
    isFeatured: input.isFeatured === true,
    displayOrder: Number(input.displayOrder || 0),
    isPublished: input.isPublished !== false,
    sourceImageName: String(input.sourceImageName || "").trim(),
    ...(actorId ? { updatedBy: actorId } : {}),
  };
  if (!body.shortDescription && body.studentName && body.tournamentName && body.result) {
    body.shortDescription = `${body.studentName} achieved ${body.result} at ${body.tournamentName}.`;
  }
  return body;
}

export async function getLandingAchievements() {
  try {
    await dbConnect();
    const records = await Achievement.find({ isPublished: { $ne: false } })
      .sort({ isFeatured: -1, displayOrder: 1, createdAt: -1 })
      .limit(80)
      .lean();
    if (records.length) return records.map(serializeAchievement);
  } catch {
    return seededAchievements;
  }
  return seededAchievements;
}

export async function seedVerifiedAchievements(actorId?: string) {
  const inserted = [];
  for (const item of seededAchievements) {
    const existing = await Achievement.findOne({
      studentName: item.studentName,
      tournamentName: item.tournamentName,
      result: item.result,
    });
    if (existing) {
      existing.set({ ...item, updatedBy: actorId });
      await existing.save();
      inserted.push(existing);
      continue;
    }
    inserted.push(await Achievement.create({ ...item, createdBy: actorId, updatedBy: actorId }));
  }
  return inserted.map(serializeAchievement);
}
