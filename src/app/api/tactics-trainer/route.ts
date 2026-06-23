import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { consumeDemoUsage } from "@/lib/demoAccess";
import { StudentReward } from "@/models/ClassroomLive";
import { TacticAttempt, TacticPuzzle } from "@/models/TacticPuzzle";

export const dynamic = "force-dynamic";

const starterPuzzles = [
  {
    _id: "starter-00sO1",
    source: "manual",
    externalId: "00sO1",
    fen: "1k1r4/pp3pp1/2p1p3/4b3/P3n1P1/8/KPP2PN1/3rBR1R b - - 2 31",
    moves: ["b8c7", "e1a5", "b7b6", "f1d1"],
    rating: 998,
    themes: ["advantage", "discoveredAttack", "middlegame", "short"],
    gameUrl: "https://lichess.org/vsfFkG0s/black#62",
    openingTags: [],
  },
  {
    _id: "starter-00sHx",
    source: "manual",
    externalId: "00sHx",
    fen: "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17",
    moves: ["e8d7", "a2e6", "d7d8", "f7f8"],
    rating: 1760,
    themes: ["mate", "mateIn2", "middlegame", "short"],
    gameUrl: "https://lichess.org/yyznGmXs/black#34",
    openingTags: ["Italian_Game", "Italian_Game_Classical_Variation"],
  },
  {
    _id: "starter-00sJb",
    source: "manual",
    externalId: "00sJb",
    fen: "Q1b2r1k/p2np2p/5bp1/q7/5P2/4B3/PPP3PP/2KR1B1R w - - 1 17",
    moves: ["d1d7", "a5e1", "d7d1", "e1e3", "c1b1", "e3b6"],
    rating: 2235,
    themes: ["advantage", "fork", "long"],
    gameUrl: "https://lichess.org/kiuvTFoE#33",
    openingTags: ["Sicilian_Defense", "Sicilian_Defense_Dragon_Variation"],
  },
];

function publicPuzzle(puzzle: any) {
  return {
    id: puzzle._id?.toString?.() || puzzle._id,
    externalId: puzzle.externalId,
    source: puzzle.source,
    fen: puzzle.fen,
    moves: puzzle.moves || [],
    rating: puzzle.rating || 1000,
    themes: puzzle.themes || [],
    gameUrl: puzzle.gameUrl || "",
    openingTags: puzzle.openingTags || [],
  };
}

function pickStarter(ratingMax: number) {
  const pool = starterPuzzles.filter((puzzle) => puzzle.rating <= ratingMax);
  return pool[Math.floor(Math.random() * (pool.length || starterPuzzles.length))] || starterPuzzles[0];
}

function cleanMoves(value: unknown) {
  return Array.isArray(value)
    ? value.map((move) => String(move || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function calculateReward(input: { solved: boolean; rating: number; mistakes: number; hintsUsed: number; timeSeconds: number }) {
  if (!input.solved) return { xp: 1, coins: 0 };
  const ratingBonus = Math.max(0, Math.floor((input.rating - 500) / 200));
  const speedBonus = input.timeSeconds <= 30 ? 3 : input.timeSeconds <= 60 ? 2 : 0;
  const penalty = Math.min(6, input.mistakes * 2 + input.hintsUsed);
  const xp = Math.max(2, 8 + ratingBonus + speedBonus - penalty);
  const coins = Math.max(1, Math.floor(xp / 5));
  return { xp, coins };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "student" && role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const url = new URL(req.url);
  const ratingMin = Math.max(0, Number(url.searchParams.get("min") || 0));
  const ratingMax = Math.max(ratingMin, Number(url.searchParams.get("max") || 1200));
  const theme = String(url.searchParams.get("theme") || "").trim();
  const filter: any = { isActive: { $ne: false }, rating: { $gte: ratingMin, $lte: ratingMax } };
  if (theme) filter.themes = theme;
  const count = await TacticPuzzle.countDocuments(filter);
  if (!count) return NextResponse.json({ puzzle: publicPuzzle(pickStarter(ratingMax)), source: "starter" });
  const skip = Math.floor(Math.random() * count);
  const puzzle = await TacticPuzzle.findOne(filter).skip(skip).lean();
  return NextResponse.json({ puzzle: publicPuzzle(puzzle), source: "database" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "student" && role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const body = await req.json();
  const puzzleId = String(body.puzzleId || "");
  const submittedMoves = cleanMoves(body.submittedMoves);
  const mistakes = Math.max(0, Number(body.mistakes || 0));
  const hintsUsed = Math.max(0, Number(body.hintsUsed || 0));
  const timeSeconds = Math.max(0, Math.min(3600, Number(body.timeSeconds || 0)));

  const puzzle: any =
    (puzzleId && await TacticPuzzle.findById(puzzleId).lean().catch(() => null)) ||
    starterPuzzles.find((item) => item._id === puzzleId || item.externalId === puzzleId);
  if (!puzzle) return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });

  const expectedMoves = cleanMoves(puzzle.moves);
  const playerMoves = expectedMoves.filter((_, index) => index % 2 === 1);
  const solved = playerMoves.length > 0 && playerMoves.every((move, index) => submittedMoves[index] === move);
  const reward = calculateReward({ solved, rating: Number(puzzle.rating || 1000), mistakes, hintsUsed, timeSeconds });

  const demoState = await consumeDemoUsage((session.user as any).id, "tacticsTrainer");
  if (!demoState.allowed) {
    return NextResponse.json({ error: "Your demo Tactics Trainer limit is finished. Please book a demo class or contact the academy." }, { status: 403 });
  }

  const attempt = await TacticAttempt.create({
    student: (session.user as any).id,
    puzzle: String(puzzle._id || "").startsWith("starter-") ? undefined : puzzle._id,
    puzzleExternalId: puzzle.externalId || puzzle._id,
    solved,
    submittedMoves,
    mistakes,
    hintsUsed,
    timeSeconds,
    rating: puzzle.rating || 0,
    themes: puzzle.themes || [],
    ...reward,
  });

  const studentReward = await StudentReward.create({
    student: (session.user as any).id,
    sourceType: "tactics_trainer",
    sourceId: attempt._id,
    xp: reward.xp,
    coins: reward.coins,
    badge: solved && mistakes === 0 && Number(puzzle.rating || 0) >= 1000 ? "Clean Tactician" : undefined,
    reason: `Tactics Trainer: ${solved ? "solved" : "attempted"} ${puzzle.externalId || puzzle._id} (${reward.xp} XP)`,
  });

  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "tactics_trainer.completed",
    label: `${solved ? "Solved" : "Attempted"} tactics puzzle ${puzzle.externalId || puzzle._id}`,
    entityType: "TacticAttempt",
    entityId: attempt._id.toString(),
    metadata: { puzzleId, solved, submittedMoves, mistakes, hintsUsed, timeSeconds, ...reward, rewardId: studentReward._id.toString() },
  });

  return NextResponse.json({
    ok: true,
    solved,
    expectedPlayerMoves: solved ? playerMoves : undefined,
    ...reward,
    badge: studentReward.badge,
    demo: demoState,
  });
}
