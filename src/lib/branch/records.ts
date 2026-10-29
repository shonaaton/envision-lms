import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { matchesSignature } from "@/lib/askCoachAttachmentRules";
import { saveUpload } from "@/lib/uploads";
import { Activity } from "@/models/Activity";
import { User } from "@/models/User";
import { BranchAchievement, BranchStudent } from "@/models/Branch";
import { BranchError } from "./errors";
import type { BranchKey } from "./scope";
import { isDateKey } from "./rules";

/** The branch's activity log and its students' achievements. */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

type Actor = { id: string; name?: string };

// ---------------------------------------------------------------------------
// Activity tracker
// ---------------------------------------------------------------------------

/**
 * What happened at the branch: anything its staff did, anything done to its
 * accounts, and every branch event, newest first.
 */
export async function branchActivity(branch: BranchKey, input: { actorId?: string; days?: number; q?: string } = {}) {
  await dbConnect();
  const users: any[] = await User.find({ branch, role: { $in: ["student", "instructor"] } }).select("name role branchRole").lean();
  const userById = new Map(users.map((user) => [id(user), user]));
  const staffIds = users.filter((user) => user.role === "instructor").map((user) => user._id);
  const days = Math.min(Math.max(Number(input.days) || 30, 1), 365);
  const filter: any = {
    occurredAt: { $gte: new Date(Date.now() - days * 86400000) },
    $or: [{ actor: { $in: staffIds } }, { targetUser: { $in: users.map((user) => user._id) } }, { type: /^branch\./ }],
  };
  if (input.actorId && isObjectId(input.actorId)) filter.actor = input.actorId;
  const q = text(input.q, 80);
  if (q) filter.label = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows: any[] = await Activity.find(filter).sort({ occurredAt: -1 }).limit(400).lean();
  // Actors outside the branch (an online admin before the branch had its own) are named too.
  const outsiders = [...new Set(rows.map((row) => id(row.actor)).filter((actor) => actor && !userById.has(actor)))];
  const others: any[] = outsiders.length ? await User.find({ _id: { $in: outsiders } }).select("name").setOptions({ allBranches: true }).lean() : [];
  for (const other of others) userById.set(id(other), other);
  return {
    staff: users.filter((user) => user.role === "instructor").map((user) => ({ id: id(user), name: user.name as string })),
    rows: rows.map((row) => ({
      id: id(row),
      label: row.label as string,
      type: row.type as string,
      occurredAt: row.occurredAt,
      actor: userById.get(id(row.actor))?.name || "System",
      target: row.targetUser ? userById.get(id(row.targetUser))?.name || "" : "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

const LEVELS = ["Centre", "District", "State", "National", "International", "Rating", "Other"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function serialize(row: any) {
  return {
    id: id(row),
    studentId: id(row.student),
    studentName: row.studentName || "",
    title: row.title as string,
    result: row.result as string,
    level: row.level || "Other",
    date: row.date || "",
    note: row.note || "",
    imageUrl: row.imageUrl || "",
    showOnPortal: row.showOnPortal !== false,
    createdByName: row.createdByName || "",
  };
}

export async function listAchievements(branch: BranchKey) {
  await dbConnect();
  const rows: any[] = await BranchAchievement.find({ branch }).sort({ date: -1, createdAt: -1 }).limit(500).lean();
  return rows.map(serialize);
}

/** A photo of the medal or certificate: JPG, PNG or WEBP under 2 MB, checked by its first bytes. */
async function storeImage(file: File | null | undefined) {
  if (!file || typeof file === "string" || !file.size) return "";
  if (file.size > MAX_IMAGE_BYTES) throw new BranchError("The photo must be under 2 MB.");
  const data = Buffer.from(await file.arrayBuffer());
  const kind = matchesSignature("jpeg", data) ? ".jpg" : matchesSignature("png", data) ? ".png" : matchesSignature("webp", data) ? ".webp" : "";
  if (!kind) throw new BranchError("The photo must be a JPG, PNG or WEBP image.");
  return saveUpload("achievements", `branch-${globalThis.crypto.randomUUID()}${kind}`, data);
}

export async function saveAchievement(branch: BranchKey, input: Record<string, any>, image: File | null, actor: Actor, achievementId?: string) {
  await dbConnect();
  const studentId = String(input.studentId || "");
  if (!isObjectId(studentId)) throw new BranchError("Pick the student.");
  const student: any = await BranchStudent.findOne({ _id: studentId, branch }).select("name").lean();
  if (!student) throw new BranchError("Student not found.", 404);
  const title = text(input.title, 160);
  const result = text(input.result, 120);
  if (!title) throw new BranchError("Name the tournament or milestone.");
  if (!result) throw new BranchError("Enter the result (e.g. 1st place).");
  const date = text(input.date, 10);
  if (date && !isDateKey(date)) throw new BranchError("Enter a valid date.");
  const imageUrl = await storeImage(image);
  const fields: Record<string, unknown> = {
    student: student._id,
    studentName: student.name,
    title,
    result,
    level: LEVELS.includes(input.level) ? input.level : "Other",
    date,
    note: text(input.note, 500),
    showOnPortal: String(input.showOnPortal) !== "false",
    ...(imageUrl ? { imageUrl } : {}),
  };
  if (achievementId) {
    if (!isObjectId(achievementId)) throw new BranchError("Not found.", 404);
    const updated = await BranchAchievement.findOneAndUpdate({ _id: achievementId, branch }, { $set: fields }, { new: true }).lean();
    if (!updated) throw new BranchError("Not found.", 404);
    return serialize(updated);
  }
  const created: any = await BranchAchievement.create({ ...fields, branch, createdBy: actor.id, createdByName: actor.name || "" });
  void recordActivity({ actor: actor.id, type: "branch.achievement_added", label: `Added ${student.name}'s achievement: ${result}, ${title}`, entityType: "BranchAchievement", entityId: id(created) });
  return serialize(created.toObject());
}

export async function deleteAchievement(branch: BranchKey, achievementId: string) {
  await dbConnect();
  if (!isObjectId(achievementId)) throw new BranchError("Not found.", 404);
  const result = await BranchAchievement.deleteOne({ _id: achievementId, branch });
  if (!result.deletedCount) throw new BranchError("Not found.", 404);
}

/** A student's own achievements, for their page. */
export async function myAchievements(studentId: unknown) {
  await dbConnect();
  const rows: any[] = await BranchAchievement.find({ student: studentId, showOnPortal: { $ne: false } }).sort({ date: -1, createdAt: -1 }).limit(20).lean();
  return rows.map(serialize);
}
