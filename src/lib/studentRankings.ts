import "server-only";

import { dbConnect } from "@/lib/db";
import { Submission } from "@/models/Homework";
import { Attendance } from "@/models/Attendance";
import { LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { User } from "@/models/User";

/**
 * Per-student totals behind the leaderboard and the dashboard's academy rank.
 *
 * Both used to load every submission, reward, attendance register and live quiz
 * answer in the academy into memory on every view, then filter them once per
 * student. MongoDB now adds them up, and the totals are kept for five minutes:
 * a rank may lag new points by up to that long.
 *
 * Every figure is a sum or count of whole numbers (XP, coins, scores and
 * accuracy are all rounded where they are written), so the totals are exactly
 * what the old in-memory loops produced. `studentRankings.test.ts` and the
 * equivalence check that shipped with this change compare the two.
 */

export const RANKING_CACHE_TTL_MS = 5 * 60_000;

export type HomeworkTotals = { count: number; scoreSum: number; accuracySum: number };
export type LiveTotals = { classroom: string; count: number; scoreSum: number; correctCount: number };
export type RewardTotals = { liveQuestionXp: number; tournamentXp: number; bonusXp: number; coins: number; badges: number };
export type AttendanceTotals = { records: number; attended: number };

export type StudentActivityTotals = {
  homework: Map<string, HomeworkTotals>;
  /** One entry per classroom the student answered live questions in. */
  live: Map<string, LiveTotals[]>;
  rewards: Map<string, RewardTotals>;
  attendance: Map<string, AttendanceTotals>;
};

export type AcademyRankRow = { id: string; batches: string[]; total: number };

type CacheEntry<T> = { promise: Promise<T>; expiresAt: number };

declare global {
  var __lmsStudentRankingCache: { totals?: CacheEntry<StudentActivityTotals>; academy?: CacheEntry<AcademyRankRow[]> } | undefined;
}

function cached<T>(key: "totals" | "academy", load: () => Promise<T>): Promise<T> {
  const store = (globalThis.__lmsStudentRankingCache ||= {});
  const now = Date.now();
  const existing = store[key] as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.promise;
  const entry: CacheEntry<T> = { promise: load(), expiresAt: now + RANKING_CACHE_TTL_MS };
  (store as Record<string, CacheEntry<unknown>>)[key] = entry;
  entry.promise.catch(() => {
    if (store[key] === (entry as CacheEntry<unknown>)) delete store[key];
  });
  return entry.promise;
}

const id = (value: unknown) => (value === null || value === undefined ? "" : String(value));
/** `value || 0`, as the old loops wrote it. */
const orZero = (field: string) => ({ $ifNull: [`$${field}`, 0] });
/** JavaScript truthiness of a field: false for missing, null, false, 0 and "". */
const truthy = (field: string) => ({
  $and: [{ $ne: [{ $ifNull: [`$${field}`, false] }, false] }, { $ne: [`$${field}`, 0] }, { $ne: [`$${field}`, ""] }],
});
const REWARD_SOURCES = ["live_question", "tournament_game"];

async function loadTotals(): Promise<StudentActivityTotals> {
  await dbConnect();
  const [homework, live, rewards, attendance] = await Promise.all([
    Submission.aggregate([
      { $group: { _id: "$student", count: { $sum: 1 }, scoreSum: { $sum: orZero("totalScore") }, accuracySum: { $sum: orZero("accuracy") } } },
    ]),
    LiveQuestionResponse.aggregate([
      {
        $group: {
          _id: { student: "$student", classroom: "$classroom" },
          count: { $sum: 1 },
          scoreSum: { $sum: orZero("score") },
          correctCount: { $sum: { $cond: [truthy("correct"), 1, 0] } },
        },
      },
    ]),
    StudentReward.aggregate([
      {
        $group: {
          _id: "$student",
          liveQuestionXp: { $sum: { $cond: [{ $eq: ["$sourceType", "live_question"] }, orZero("xp"), 0] } },
          tournamentXp: { $sum: { $cond: [{ $eq: ["$sourceType", "tournament_game"] }, orZero("xp"), 0] } },
          bonusXp: { $sum: { $cond: [{ $in: [{ $ifNull: ["$sourceType", ""] }, REWARD_SOURCES] }, 0, orZero("xp")] } },
          coins: { $sum: orZero("coins") },
          badges: { $sum: { $cond: [truthy("badge"), 1, 0] } },
        },
      },
    ]),
    Attendance.aggregate([
      { $unwind: "$records" },
      {
        $group: {
          _id: "$records.student",
          records: { $sum: 1 },
          attended: { $sum: { $cond: [{ $in: ["$records.status", ["present", "late"]] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const liveByStudent = new Map<string, LiveTotals[]>();
  for (const row of live) {
    const student = id(row._id?.student);
    const list = liveByStudent.get(student) || [];
    list.push({ classroom: id(row._id?.classroom), count: row.count, scoreSum: row.scoreSum, correctCount: row.correctCount });
    liveByStudent.set(student, list);
  }
  return {
    homework: new Map(homework.map((row: any) => [id(row._id), { count: row.count, scoreSum: row.scoreSum, accuracySum: row.accuracySum }])),
    live: liveByStudent,
    rewards: new Map(rewards.map((row: any) => [id(row._id), {
      liveQuestionXp: row.liveQuestionXp,
      tournamentXp: row.tournamentXp,
      bonusXp: row.bonusXp,
      coins: row.coins,
      badges: row.badges,
    }])),
    attendance: new Map(attendance.map((row: any) => [id(row._id), { records: row.records, attended: row.attended }])),
  };
}

/** The shared totals. Read-only: callers must not change what they get. */
export function getStudentActivityTotals(): Promise<StudentActivityTotals> {
  return cached("totals", loadTotals);
}

/**
 * Every active student with their dashboard ranking total (homework score plus
 * every reward's XP and coins), highest first. Ties keep the order students
 * were listed in, as the old in-memory sort did.
 */
export function getAcademyRankRows(): Promise<AcademyRankRow[]> {
  return cached("academy", async () => {
    await dbConnect();
    const [students, totals] = await Promise.all([
      User.find({ role: "student", isActive: { $ne: false } }).select("_id batches").lean(),
      getStudentActivityTotals(),
    ]);
    return buildAcademyRankRows(students as any[], totals);
  });
}

export function buildAcademyRankRows(students: Array<{ _id: unknown; batches?: unknown[] }>, totals: Pick<StudentActivityTotals, "homework" | "rewards">) {
  return students
    .map((student) => {
      const studentId = id(student._id);
      const homework = totals.homework.get(studentId);
      const rewards = totals.rewards.get(studentId);
      const rewardTotal = rewards ? rewards.liveQuestionXp + rewards.tournamentXp + rewards.bonusXp + rewards.coins : 0;
      return { id: studentId, batches: (student.batches || []).map(id), total: (homework?.scoreSum || 0) + rewardTotal };
    })
    .sort((a, b) => b.total - a.total);
}

/** Academy rank and rank among students sharing a batch; "-" when unranked. */
export function rankFromRows(rows: AcademyRankRow[], userId: string) {
  const academyRank = rows.findIndex((row) => row.id === userId) + 1;
  const studentRow = rows.find((row) => row.id === userId);
  const batchPool = rows.filter((row) => row.batches.some((batch) => studentRow?.batches.includes(batch)));
  const batchRank = batchPool.findIndex((row) => row.id === userId) + 1;
  return {
    academyRank: academyRank || ("-" as const),
    batchRank: batchRank || ("-" as const),
  };
}

export type LeaderboardScope = "academy" | "batch" | "course" | "level" | "class" | string;

/**
 * One leaderboard row per student, from the totals. Mirrors the old per-student
 * loops: live quiz answers count only in the chosen classrooms for class,
 * course and level boards, where tournament points are also left out.
 */
export function buildLeaderboardRow(student: any, totals: StudentActivityTotals, scope: LeaderboardScope, scopedClassroomIds: Set<string>) {
  const studentId = id(student._id);
  const homework = totals.homework.get(studentId) || { count: 0, scoreSum: 0, accuracySum: 0 };
  const classroomScoped = scope === "class" || scope === "course" || scope === "level";
  const live = (totals.live.get(studentId) || []).filter((row) => !classroomScoped || scopedClassroomIds.has(row.classroom));
  const rewards = totals.rewards.get(studentId) || { liveQuestionXp: 0, tournamentXp: 0, bonusXp: 0, coins: 0, badges: 0 };
  const attendance = totals.attendance.get(studentId) || { records: 0, attended: 0 };

  const liveCount = live.reduce((sum, row) => sum + row.count, 0);
  const liveCorrect = live.reduce((sum, row) => sum + row.correctCount, 0);
  const quizPoints = live.reduce((sum, row) => sum + row.scoreSum, 0);
  const scopedTournamentPoints = scope === "course" || scope === "level" || scope === "class" ? 0 : rewards.tournamentXp;
  const totalPoints = homework.scoreSum + rewards.liveQuestionXp + scopedTournamentPoints + rewards.bonusXp;
  const accuracyCount = homework.count + liveCount;
  const accuracy = accuracyCount ? Math.round((homework.accuracySum + liveCorrect * 100) / accuracyCount) : 0;
  return {
    id: studentId,
    name: student.name,
    username: student.username || "",
    email: student.email || "",
    batchNames: (student.batches || []).map((batch: any) => batch.name).join(", "),
    totalPoints,
    homeworkCompleted: homework.count,
    quizScore: quizPoints,
    tournamentPoints: scopedTournamentPoints,
    accuracy,
    attendance: attendance.records ? Math.round((attendance.attended / attendance.records) * 100) : 0,
    xp: totalPoints,
    coins: rewards.coins,
    badges: rewards.badges,
    bonusXp: rewards.bonusXp,
    liveRewardXp: rewards.liveQuestionXp,
  };
}
