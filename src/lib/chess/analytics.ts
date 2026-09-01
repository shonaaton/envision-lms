import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { ChessAccount, ChessGame, ChessRatingSnapshot, ChessSyncJob } from "@/models/Chess";
import { User } from "@/models/User";
import type { ChessColor, ChessPlatform, ChessRatingType, TimeControlCategory } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
  all: null,
};

export type ChessAnalyticsFilters = {
  period?: string;
  platform?: ChessPlatform | "ALL";
  timeControl?: TimeControlCategory | "all";
  color?: ChessColor | "all";
};

export async function getChessDashboard(studentId: string, filters: ChessAnalyticsFilters = {}) {
  await dbConnect();
  const student: any = await User.findById(studentId, { name: 1, username: 1, rating: 1 }).lean();
  const accounts: any[] = await ChessAccount.find({ student: studentId, isActive: true }).sort({ platform: 1 }).lean();
  const accountIds = accounts.map((account) => account._id);
  if (!accounts.length) {
    return {
      connected: false,
      student: serializeStudent(student, studentId),
      accounts: [],
      summary: emptySummary(),
      ratingSeries: [],
      heatmap: [],
      heatmapSummary: emptyHeatmapSummary(),
      recentGames: [],
      openings: emptyOpenings(),
      opponentAnalytics: emptyOpponentAnalytics(),
      form: emptyForm(),
      coachInsights: [],
      syncJobs: [],
    };
  }

  const range = dateRange(filters.period || "30d");
  const gameFilter: Record<string, any> = { student: new Types.ObjectId(studentId), chessAccount: { $in: accountIds } };
  if (range.from) gameFilter.playedAt = { $gte: range.from, $lte: range.to };
  if (filters.platform && filters.platform !== "ALL") gameFilter.platform = filters.platform;
  if (filters.timeControl && filters.timeControl !== "all") gameFilter.timeControlCategory = filters.timeControl;
  if (filters.color && filters.color !== "all") gameFilter.studentColor = filters.color;

  const [summary, byColor, ratingSeries, heatmap, recentGames, openings, opponentAnalytics, form, latestJobs] = await Promise.all([
    resultSummary(gameFilter),
    colorSummary(gameFilter),
    getRatingSeries(studentId, accountIds, range.from),
    getActivityHeatmap(studentId, accountIds),
    getRecentGames(gameFilter),
    getOpeningStats(gameFilter),
    getOpponentAnalytics(gameFilter),
    getForm(gameFilter),
    ChessSyncJob.find({ account: { $in: accountIds } }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  return {
    connected: true,
    student: serializeStudent(student, studentId),
    accounts: accounts.map(serializeAccount),
    summary: { ...summary, byColor },
    ratingSeries,
    heatmap: heatmap.days,
    heatmapSummary: heatmap.summary,
    recentGames: recentGames.map(serializeGame),
    openings,
    opponentAnalytics,
    form,
    coachInsights: buildCoachInsights(summary, openings, heatmap.summary, form),
    syncJobs: latestJobs.map((job: any) => ({
      id: job._id.toString(),
      accountId: job.account?.toString?.(),
      platform: job.platform,
      status: job.status,
      gamesFound: job.gamesFound || 0,
      gamesImported: job.gamesImported || 0,
      duplicatesSkipped: job.duplicatesSkipped || 0,
      error: job.error,
      createdAt: job.createdAt?.toISOString?.(),
    })),
  };
}

export async function getTeacherChessStudents(coachId: string) {
  const { getCoachAssignedStudentIds } = await import("@/lib/coachStudentAccess");
  await dbConnect();
  const studentIds = await getCoachAssignedStudentIds(coachId);
  const students: any[] = await User.find({ _id: { $in: studentIds }, role: "student", isActive: { $ne: false } }, { name: 1, username: 1, batches: 1 }).lean();
  const rows = await Promise.all(students.map((student) => getStudentRow(student)));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAdminChessStudents(q?: string, status?: string) {
  await dbConnect();
  const filter: any = { role: "student", isActive: { $ne: false } };
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: regex }, { email: regex }, { username: regex }];
  }
  const students: any[] = await User.find(filter, { name: 1, username: 1 }).sort({ name: 1 }).limit(80).lean();
  const rows = await Promise.all(students.map((student) => getStudentRow(student)));
  return rows.filter((row) => {
    if (!status || status === "all") return true;
    if (status === "connected") return row.connectionStatus !== "Not Connected";
    if (status === "not_connected") return row.connectionStatus === "Not Connected";
    if (status === "both") return row.connectionStatus === "Both";
    if (status === "chess_com") return row.connectionStatus === "Chess.com Only";
    if (status === "lichess") return row.connectionStatus === "Lichess Only";
    if (status === "sync_failed") return row.syncStatus === "FAILED";
    return true;
  });
}

async function getStudentRow(student: any) {
  const accounts: any[] = await ChessAccount.find({ student: student._id, isActive: true }, { platform: 1, syncStatus: 1 }).lean();
  const accountIds = accounts.map((account) => account._id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
  const [rapidRating, games30, previousRapid] = await Promise.all([
    latestRating(student._id.toString(), "rapid"),
    ChessGame.countDocuments({ student: student._id, chessAccount: { $in: accountIds }, playedAt: { $gte: thirtyDaysAgo } }),
    ratingBefore(student._id.toString(), "rapid", thirtyDaysAgo),
  ]);
  return {
    id: student._id.toString(),
    name: student.name || "Student",
    username: student.username || "",
    rapidRating: rapidRating?.rating || null,
    ratingChange30: rapidRating?.rating && previousRapid?.rating ? rapidRating.rating - previousRapid.rating : null,
    games30,
    connectionStatus: connectionStatus(accounts),
    syncStatus: accounts.some((account) => account.syncStatus === "FAILED") ? "FAILED" : accounts.some((account) => account.syncStatus === "SYNCING") ? "SYNCING" : "COMPLETED",
  };
}

async function resultSummary(filter: Record<string, any>) {
  const rows = await ChessGame.aggregate([
    { $match: filter },
    { $group: { _id: "$result", count: { $sum: 1 } } },
  ]);
  const wins = countFor(rows, "win");
  const draws = countFor(rows, "draw");
  const losses = countFor(rows, "loss");
  const gamesPlayed = wins + draws + losses;
  const previous = await previousPeriodSummary(filter);
  return {
    gamesPlayed,
    wins,
    draws,
    losses,
    winPercentage: percent(wins, gamesPlayed),
    ratingChange: 0,
    activityChange: previous.gamesPlayed ? Math.round(((gamesPlayed - previous.gamesPlayed) / previous.gamesPlayed) * 100) : null,
  };
}

async function previousPeriodSummary(filter: Record<string, any>) {
  const playedAt = filter.playedAt;
  if (!playedAt?.$gte || !playedAt?.$lte) return { gamesPlayed: 0 };
  const from = new Date(playedAt.$gte);
  const to = new Date(playedAt.$lte);
  const length = to.getTime() - from.getTime();
  const previousFilter = { ...filter, playedAt: { $gte: new Date(from.getTime() - length), $lt: from } };
  return { gamesPlayed: await ChessGame.countDocuments(previousFilter) };
}

async function colorSummary(filter: Record<string, any>) {
  const rows = await ChessGame.aggregate([
    { $match: filter },
    { $group: { _id: { color: "$studentColor", result: "$result" }, count: { $sum: 1 } } },
  ]);
  return {
    white: resultBucket(rows.filter((row) => row._id.color === "white")),
    black: resultBucket(rows.filter((row) => row._id.color === "black")),
  };
}

async function getRatingSeries(studentId: string, accountIds: any[], from?: Date | null) {
  const match: any = { student: new Types.ObjectId(studentId), chessAccount: { $in: accountIds } };
  if (from) match.recordedAt = { $gte: from };
  const snapshots: any[] = await ChessRatingSnapshot.find(match).sort({ platform: 1, ratingType: 1, recordedAt: 1 }).lean();
  const latestByKey = new Map<string, number>();
  return snapshots.map((snapshot) => {
    const key = `${snapshot.platform}:${snapshot.ratingType}`;
    const previous = latestByKey.get(key);
    latestByKey.set(key, snapshot.rating);
    return {
      id: snapshot._id.toString(),
      platform: snapshot.platform,
      ratingType: snapshot.ratingType,
      rating: snapshot.rating,
      recordedAt: snapshot.recordedAt.toISOString(),
      change: previous === undefined ? 0 : snapshot.rating - previous,
    };
  });
}

async function getActivityHeatmap(studentId: string, accountIds: any[]) {
  const from = new Date(Date.now() - 365 * DAY_MS);
  const rows = await ChessGame.aggregate([
    { $match: { student: new Types.ObjectId(studentId), chessAccount: { $in: accountIds }, playedAt: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$playedAt" } }, count: { $sum: 1 }, wins: { $sum: { $cond: [{ $eq: ["$result", "win"] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  const days = rows.map((row) => ({ date: row._id, count: row.count, wins: row.wins }));
  const activeDates = new Set(days.map((day) => day.date));
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const gamesThisMonth = days.filter((day) => day.date.startsWith(monthKey)).reduce((sum, day) => sum + day.count, 0);
  return {
    days,
    summary: {
      gamesThisMonth,
      activeDays: days.length,
      averageGamesPerDay: days.length ? Number((days.reduce((sum, day) => sum + day.count, 0) / 365).toFixed(2)) : 0,
      longestActiveStreak: streakLength(activeDates, from, now, false),
      currentStreak: streakLength(activeDates, from, now, true),
    },
  };
}

async function getRecentGames(filter: Record<string, any>) {
  return ChessGame.find(filter).sort({ playedAt: -1 }).limit(20).lean();
}

async function getOpeningStats(filter: Record<string, any>) {
  const rows = await ChessGame.aggregate([
    { $match: { ...filter, opening: { $exists: true, $nin: ["", null] } } },
    {
      $group: {
        _id: { opening: "$opening", eco: "$eco", color: "$studentColor" },
        games: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ["$result", "win"] }, 1, 0] } },
        draws: { $sum: { $cond: [{ $eq: ["$result", "draw"] }, 1, 0] } },
        losses: { $sum: { $cond: [{ $eq: ["$result", "loss"] }, 1, 0] } },
        averageOpponent: { $avg: "$opponentRating" },
      },
    },
    { $sort: { games: -1 } },
    { $limit: 40 },
  ]);
  const mapped = rows.map((row) => ({
    opening: row._id.opening,
    eco: row._id.eco,
    color: row._id.color,
    games: row.games,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    winPercentage: percent(row.wins, row.games),
    drawPercentage: percent(row.draws, row.games),
    lossPercentage: percent(row.losses, row.games),
    averageOpponent: Math.round(row.averageOpponent || 0),
    meaningful: row.games >= 5,
  }));
  const meaningful = mapped.filter((row) => row.meaningful);
  return {
    rows: mapped,
    mostPlayed: mapped[0] || null,
    bestPerforming: meaningful.sort((a, b) => b.winPercentage - a.winPercentage)[0] || null,
    worstPerforming: meaningful.sort((a, b) => a.winPercentage - b.winPercentage)[0] || null,
  };
}

async function getOpponentAnalytics(filter: Record<string, any>) {
  const games: any[] = await ChessGame.find({ ...filter, studentRating: { $type: "number" }, opponentRating: { $type: "number" } }, { result: 1, studentRating: 1, opponentRating: 1 }).lean();
  const buckets = {
    weaker: bucketOpponent(games.filter((game) => game.opponentRating <= game.studentRating - 100)),
    similar: bucketOpponent(games.filter((game) => Math.abs(game.opponentRating - game.studentRating) < 100)),
    stronger: bucketOpponent(games.filter((game) => game.opponentRating >= game.studentRating + 100)),
  };
  const averageOpponent = games.length ? Math.round(games.reduce((sum, game) => sum + Number(game.opponentRating || 0), 0) / games.length) : 0;
  return { averageOpponent, ...buckets };
}

async function getForm(filter: Record<string, any>) {
  const games: any[] = await ChessGame.find(filter).sort({ playedAt: -1 }).limit(50).lean();
  const slice = games.slice(0, 25);
  const wins = slice.filter((game) => game.result === "win").length;
  const draws = slice.filter((game) => game.result === "draw").length;
  const losses = slice.filter((game) => game.result === "loss").length;
  const ratingChange = slice.reduce((sum, game) => sum + Number(game.ratingChange || 0), 0);
  const averageOpponent = slice.length ? Math.round(slice.reduce((sum, game) => sum + Number(game.opponentRating || 0), 0) / slice.length) : 0;
  const averageGameLength = slice.length ? Math.round(slice.reduce((sum, game) => sum + Number(game.moveCount || 0), 0) / slice.length) : 0;
  return {
    last10: games.slice(0, 10).map((game) => resultLetter(game.result)),
    last25: { wins, draws, losses, winPercentage: percent(wins, slice.length), ratingChange, averageOpponent, averageGameLength },
    currentStreak: currentResultStreak(games),
  };
}

async function latestRating(studentId: string, ratingType: ChessRatingType) {
  return ChessRatingSnapshot.findOne({ student: studentId, ratingType }).sort({ recordedAt: -1 }).lean() as any;
}

async function ratingBefore(studentId: string, ratingType: ChessRatingType, before: Date) {
  return ChessRatingSnapshot.findOne({ student: studentId, ratingType, recordedAt: { $lt: before } }).sort({ recordedAt: -1 }).lean() as any;
}

function buildCoachInsights(summary: any, openings: any, heatmapSummary: any, form: any) {
  const insights = [];
  if (openings.bestPerforming) insights.push({ label: "Strongest Area", value: openings.bestPerforming.opening, note: `${openings.bestPerforming.winPercentage}% win rate from ${openings.bestPerforming.games} games` });
  if (openings.worstPerforming) insights.push({ label: "Needs Attention", value: openings.worstPerforming.opening, note: `${openings.worstPerforming.winPercentage}% win rate from ${openings.worstPerforming.games} games` });
  if (summary.gamesPlayed > 0) insights.push({ label: "Current Form", value: form.last10.join(" "), note: `${summary.winPercentage}% wins in selected range` });
  if (heatmapSummary.gamesThisMonth < 4) insights.push({ label: "Activity", value: "Low recent volume", note: `${heatmapSummary.gamesThisMonth} games this month` });
  return insights.slice(0, 4);
}

function serializeStudent(student: any, fallbackId: string) {
  return { id: student?._id?.toString?.() || fallbackId, name: student?.name || "Student", username: student?.username || "" };
}

function serializeAccount(account: any) {
  return {
    id: account._id.toString(),
    platform: account.platform,
    username: account.username,
    verified: Boolean(account.verified),
    lastSyncedAt: account.lastSyncedAt?.toISOString?.() || null,
    syncStatus: account.syncStatus,
    lastError: account.lastError || null,
  };
}

function serializeGame(game: any) {
  return {
    id: game._id.toString(),
    result: game.result,
    studentColor: game.studentColor,
    opponentUsername: game.opponentUsername,
    studentRating: game.studentRating || null,
    opponentRating: game.opponentRating || null,
    ratingChange: game.ratingChange || null,
    opening: game.opening || "Unknown",
    eco: game.eco || "",
    timeControl: game.timeControl || "",
    timeControlCategory: game.timeControlCategory,
    platform: game.platform,
    playedAt: game.playedAt.toISOString(),
    gameUrl: game.gameUrl || "",
    pgn: game.pgn || "",
  };
}

function resultBucket(rows: any[]) {
  const wins = rows.filter((row) => row._id.result === "win").reduce((sum, row) => sum + row.count, 0);
  const draws = rows.filter((row) => row._id.result === "draw").reduce((sum, row) => sum + row.count, 0);
  const losses = rows.filter((row) => row._id.result === "loss").reduce((sum, row) => sum + row.count, 0);
  const total = wins + draws + losses;
  return { wins, draws, losses, total, winPercentage: percent(wins, total) };
}

function bucketOpponent(games: any[]) {
  const wins = games.filter((game) => game.result === "win").length;
  return { games: games.length, wins, winPercentage: percent(wins, games.length) };
}

function countFor(rows: any[], result: string) {
  return Number(rows.find((row) => row._id === result)?.count || 0);
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function resultLetter(result: string) {
  return result === "win" ? "W" : result === "draw" ? "D" : "L";
}

function currentResultStreak(games: any[]) {
  if (!games.length) return "";
  const first = games[0].result;
  const count = games.findIndex((game) => game.result !== first);
  return `${count === -1 ? games.length : count}${resultLetter(first)}`;
}

function streakLength(activeDates: Set<string>, from: Date, to: Date, currentOnly: boolean) {
  let longest = 0;
  let current = 0;
  const start = currentOnly ? new Date(to) : new Date(from);
  if (currentOnly) {
    for (let time = startOfDay(start).getTime(); time >= startOfDay(from).getTime(); time -= DAY_MS) {
      const key = new Date(time).toISOString().slice(0, 10);
      if (activeDates.has(key)) current += 1;
      else break;
    }
    return current;
  }
  for (let time = startOfDay(from).getTime(); time <= startOfDay(to).getTime(); time += DAY_MS) {
    const key = new Date(time).toISOString().slice(0, 10);
    if (activeDates.has(key)) current += 1;
    else current = 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function dateRange(period: string) {
  const to = new Date();
  const days = PERIOD_DAYS[period] ?? 30;
  return { from: days ? new Date(to.getTime() - days * DAY_MS) : null, to };
}

function connectionStatus(accounts: any[]) {
  const chessCom = accounts.some((account) => account.platform === "CHESS_COM");
  const lichess = accounts.some((account) => account.platform === "LICHESS");
  if (chessCom && lichess) return "Both";
  if (chessCom) return "Chess.com Only";
  if (lichess) return "Lichess Only";
  return "Not Connected";
}

function emptySummary() {
  return { gamesPlayed: 0, wins: 0, draws: 0, losses: 0, winPercentage: 0, ratingChange: 0, activityChange: null, byColor: { white: resultBucket([]), black: resultBucket([]) } };
}

function emptyHeatmapSummary() {
  return { gamesThisMonth: 0, activeDays: 0, averageGamesPerDay: 0, longestActiveStreak: 0, currentStreak: 0 };
}

function emptyOpenings() {
  return { rows: [], mostPlayed: null, bestPerforming: null, worstPerforming: null };
}

function emptyOpponentAnalytics() {
  return { averageOpponent: 0, weaker: { games: 0, wins: 0, winPercentage: 0 }, similar: { games: 0, wins: 0, winPercentage: 0 }, stronger: { games: 0, wins: 0, winPercentage: 0 } };
}

function emptyForm() {
  return { last10: [], last25: { wins: 0, draws: 0, losses: 0, winPercentage: 0, ratingChange: 0, averageOpponent: 0, averageGameLength: 0 }, currentStreak: "" };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
