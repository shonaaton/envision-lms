import "server-only";

import { Types } from "mongoose";
import { exitStudentId as idOf } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { EXIT_REASONS, PAUSE_REASONS, exitReasonLabel } from "@/lib/retention/exitReasons";
import { settleFlag } from "@/lib/retention/retentionSweep";
import { LEVEL_RANK, type RiskLevel } from "@/lib/retention/riskRules";
import { Classroom } from "@/models/Classroom";
import { RetentionFlag } from "@/models/RetentionFlag";
import { StudentPause } from "@/models/StudentPause";
import { User } from "@/models/User";

const DAY = 86_400_000;

export const CONTACT_CHANNELS = ["call", "whatsapp", "email", "in_person", "other"] as const;
export const MANUAL_OUTCOMES = ["stayed", "paused", "left", "false_alarm"] as const;
export type ManualOutcome = (typeof MANUAL_OUTCOMES)[number];

type Actor = { id: string; name?: string };

/** A student was deactivated: their open flag, if any, ends as "left" with the reason given. */
export async function closeFlagForDepartedStudent(studentId: string, exitReason: { category?: string; note?: string } | undefined, actor: Actor) {
  await dbConnect();
  const flag: any = await RetentionFlag.findOne({ student: studentId, status: "open" }).lean();
  if (!flag) return null;
  const reason = exitReason?.category ? exitReasonLabel(exitReason.category) : "";
  return settleFlag(flag, {
    outcome: "left",
    note: [reason, exitReason?.note].filter(Boolean).join(" - "),
    by: actor.id,
    byName: actor.name,
  });
}

export async function logContact(flagId: string, input: { channel?: string; note?: string }, actor: Actor) {
  if (!Types.ObjectId.isValid(flagId)) throw new Error("Unknown flag.");
  const note = String(input.note || "").trim().slice(0, 1000);
  if (!note) throw new Error("Write what the family said.");
  const channel = (CONTACT_CHANNELS as readonly string[]).includes(String(input.channel)) ? String(input.channel) : "call";
  await dbConnect();
  const flag = await RetentionFlag.findOneAndUpdate(
    { _id: flagId, status: "open" },
    { $push: { contactLog: { at: new Date(), by: new Types.ObjectId(actor.id), byName: actor.name || "", channel, note } } },
    { new: true }
  ).lean();
  if (!flag) throw new Error("This flag is already settled.");
  return flag;
}

export async function resolveFlag(flagId: string, input: { outcome?: string; note?: string }, actor: Actor) {
  if (!Types.ObjectId.isValid(flagId)) throw new Error("Unknown flag.");
  if (!(MANUAL_OUTCOMES as readonly string[]).includes(String(input.outcome))) throw new Error("Choose how it ended.");
  await dbConnect();
  const flag: any = await RetentionFlag.findById(flagId).lean();
  if (!flag || flag.status !== "open") throw new Error("This flag is already settled.");
  const settled = await settleFlag(flag, {
    outcome: input.outcome as ManualOutcome,
    note: String(input.note || "").trim().slice(0, 1000),
    by: actor.id,
    byName: actor.name,
  });
  if (!settled) throw new Error("This flag is already settled.");
  return settled;
}

/** Everything the Retention page shows: open flags, recent settled ones, the counts and the reasons families give. */
export async function retentionOverview(now = new Date()) {
  await dbConnect();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since180 = new Date(now.getTime() - 180 * DAY);
  const [open, resolved, leavers, pauses]: any[][] = await Promise.all([
    RetentionFlag.find({ status: "open" }).sort({ firstFlaggedAt: 1 }).lean(),
    RetentionFlag.find({ status: "resolved", "resolution.at": { $gte: new Date(now.getTime() - 90 * DAY) } }).sort({ "resolution.at": -1 }).limit(200).lean(),
    User.find({ role: "student", isActive: false, deactivatedAt: { $gte: since180 } }).select("exitReason").lean(),
    StudentPause.find({ status: { $ne: "cancelled" }, pausedFrom: { $gte: since180 } }).select("reasonCategory").lean(),
  ]);

  const studentIds = Array.from(new Set([...open, ...resolved].map((flag) => idOf(flag.student))));
  const [students, classrooms]: any[][] = await Promise.all([
    User.find({ _id: { $in: studentIds } }).select("name username parentName phone countryCode isActive").lean(),
    Classroom.find({ students: { $in: studentIds }, isActive: { $ne: false }, classroomType: { $ne: "demo" }, isTestClassroom: { $ne: true }, isSessionInstance: { $ne: true } })
      .select("title students coach instructor")
      .populate("coach", "name")
      .populate("instructor", "name")
      .lean(),
  ]);
  const studentById = new Map(students.map((student) => [idOf(student), student]));
  const coachesByStudent = new Map<string, Set<string>>();
  classrooms.forEach((classroom) => {
    const coach = (classroom.coach || classroom.instructor) as any;
    if (!coach?.name) return;
    (classroom.students || []).forEach((studentId: any) => {
      const set = coachesByStudent.get(idOf(studentId)) || new Set<string>();
      set.add(coach.name);
      coachesByStudent.set(idOf(studentId), set);
    });
  });

  const shape = (flag: any) => {
    const student: any = studentById.get(idOf(flag.student));
    return {
      _id: idOf(flag),
      status: flag.status,
      level: flag.level,
      peakLevel: flag.peakLevel || flag.level,
      reasons: flag.reasons || [],
      inWindow: Boolean(flag.inWindow),
      firstFlaggedAt: flag.firstFlaggedAt,
      lastEvaluatedAt: flag.lastEvaluatedAt,
      contactLog: (flag.contactLog || []).map((entry: any) => ({ at: entry.at, byName: entry.byName, channel: entry.channel, note: entry.note })),
      resolution: flag.resolution?.outcome ? { outcome: flag.resolution.outcome, note: flag.resolution.note, byName: flag.resolution.byName, at: flag.resolution.at, auto: Boolean(flag.resolution.auto) } : null,
      student: {
        _id: idOf(flag.student),
        name: student?.name || student?.username || "Removed student",
        parentName: student?.parentName || "",
        phone: student?.phone ? `${student.countryCode || ""} ${student.phone}`.trim() : "",
        isActive: student?.isActive !== false,
      },
      coaches: Array.from(coachesByStudent.get(idOf(flag.student)) || []),
    };
  };

  const recent = resolved.filter((flag) => flag.resolution?.at && new Date(flag.resolution.at) >= since30);
  // "Saved" means a person spoke to the family and they stayed, or the signs cleared after a call.
  const saved = recent.filter((flag) => flag.resolution?.outcome === "stayed" || (flag.resolution?.outcome === "recovered" && (flag.contactLog || []).length > 0));
  const lost = recent.filter((flag) => flag.resolution?.outcome === "left");

  const count = (rows: any[], pick: (row: any) => string | undefined) => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const key = pick(row) || "not_recorded";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  };
  const exitCounts = count(leavers, (row) => row.exitReason?.category);
  const pauseCounts = count(pauses, (row) => row.reasonCategory);

  return {
    stats: {
      open: open.filter((flag) => flag.level !== "watch").length,
      high: open.filter((flag) => flag.level === "high").length,
      watch: open.filter((flag) => flag.level === "watch").length,
      saved30: saved.length,
      left30: lost.length,
    },
    // Worst first; within a level, the longest-waiting first.
    open: open.map(shape).sort((a, b) => LEVEL_RANK[b.level as RiskLevel] - LEVEL_RANK[a.level as RiskLevel]),
    resolved: resolved.map(shape),
    exitReasons: [
      ...EXIT_REASONS.map((reason) => ({ key: reason.key, label: reason.label, count: exitCounts.get(reason.key) || 0 })),
      { key: "not_recorded", label: "Not recorded", count: exitCounts.get("not_recorded") || 0 },
    ].filter((row) => row.count > 0).sort((a, b) => b.count - a.count),
    pauseReasons: [
      ...PAUSE_REASONS.map((reason) => ({ key: reason.key, label: reason.label, count: pauseCounts.get(reason.key) || 0 })),
      { key: "not_recorded", label: "Not recorded", count: pauseCounts.get("not_recorded") || 0 },
    ].filter((row) => row.count > 0).sort((a, b) => b.count - a.count),
  };
}

/** For the admin dashboard tile. */
export async function retentionCounts() {
  await dbConnect();
  const [atRisk, high] = await Promise.all([
    RetentionFlag.countDocuments({ status: "open", level: { $in: ["at_risk", "high"] } }),
    RetentionFlag.countDocuments({ status: "open", level: "high" }),
  ]);
  return { atRisk, high };
}
