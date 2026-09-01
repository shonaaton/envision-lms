import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { consumeDemoUsage, demoUsageState } from "@/lib/demoAccess";
import { calculateTacticsReward } from "@/lib/rewards";
import { StudentReward } from "@/models/ClassroomLive";
import { TacticAttempt, TacticPuzzle } from "@/models/TacticPuzzle";
import { User } from "@/models/User";

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

function pickStarter(ratingMin: number, ratingMax: number, requiredTheme?: string) {
  const pool = starterPuzzles.filter(
    (puzzle) =>
      puzzle.rating >= ratingMin &&
      puzzle.rating <= ratingMax &&
      (!requiredTheme || puzzle.themes.includes(requiredTheme))
  );
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function cleanMoves(value: unknown) {
  return Array.isArray(value)
    ? value.map((move) => String(move || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "student" && role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "leaderboard") {
    const rows = await StudentReward.aggregate([
      { $group: { _id: "$student", xp: { $sum: "$xp" }, coins: { $sum: "$coins" } } },
      { $sort: { xp: -1, coins: -1, _id: 1 } },
    ]);
    const userIds = rows.map((row: any) => row._id);
    const users = await User.find({ _id: { $in: userIds }, role: "student", isActive: { $ne: false } })
      .select("name")
      .lean();
    const names = new Map(users.map((user: any) => [user._id.toString(), user.name]));
    const ranked = rows
      .filter((row: any) => names.has(row._id.toString()))
      .map((row: any, index: number) => ({
        rank: index + 1,
        studentId: row._id.toString(),
        name: names.get(row._id.toString()) || "Student",
        xp: Number(row.xp || 0),
        coins: Number(row.coins || 0),
      }));
    const currentUserId = String((session.user as any).id || "");
    return NextResponse.json({
      top: ranked.slice(0, 5),
      current: ranked.find((row: any) => row.studentId === currentUserId) || null,
    });
  }
  const trainer = String(url.searchParams.get("trainer") || "tactics");
  const isKingHunt = trainer === "king_hunt";
  const demoState = await demoUsageState((session.user as any).id, isKingHunt ? "kingHunt" : "tacticsTrainer");
  if (!demoState.allowed) {
    return NextResponse.json(
      {
        error: `Your demo ${isKingHunt ? "King Hunt" : "Tactics Trainer"} limit is finished. Please create a demo booking or contact the academy.`,
        demo: demoState,
      },
      { status: 403 }
    );
  }
  const ratingMin = Math.max(0, Number(url.searchParams.get("min") || 0));
  const ratingMax = Math.max(ratingMin, Number(url.searchParams.get("max") || 1200));
  const theme = String(url.searchParams.get("theme") || "").trim();
  const mateIn = Math.max(0, Math.min(5, Number(url.searchParams.get("mate") || 0)));
  if (isKingHunt && !mateIn) return NextResponse.json({ error: "Choose Mate in 1, 2, 3, 4, or 5." }, { status: 400 });
  const requiredTheme = isKingHunt ? `mateIn${mateIn}` : theme;
  const filter: any = { isActive: { $ne: false }, rating: { $gte: ratingMin, $lte: ratingMax } };
  if (requiredTheme) filter.themes = requiredTheme;
  const count = await TacticPuzzle.countDocuments(filter);
  if (!count) {
    const starter = pickStarter(ratingMin, ratingMax, requiredTheme);
    if (!starter) {
      return NextResponse.json(
        {
          error: isKingHunt
            ? `No Mate in ${mateIn} puzzles are available at this difficulty yet. Please choose another difficulty.`
            : "No puzzles are available in this difficulty yet. Please choose another level.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ puzzle: publicPuzzle(starter), source: "starter" });
  }
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
  const trainer = String(body.trainer || "tactics");
  const isKingHunt = trainer === "king_hunt";
  const mateIn = Math.max(0, Math.min(5, Number(body.mateIn || 0)));
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
  const reward = calculateTacticsReward({
    solved,
    rating: Number(puzzle.rating || 1000),
    mistakes,
    hintsUsed,
    timeSeconds,
    trainerType: isKingHunt ? "king_hunt" : "tactics",
  });

  const demoState = await consumeDemoUsage((session.user as any).id, isKingHunt ? "kingHunt" : "tacticsTrainer");
  if (!demoState.allowed) {
    return NextResponse.json(
      { error: `Your demo ${isKingHunt ? "King Hunt" : "Tactics Trainer"} limit is finished. Please create a demo booking or contact the academy.` },
      { status: 403 }
    );
  }

  const attempt = await TacticAttempt.create({
    student: (session.user as any).id,
    puzzle: String(puzzle._id || "").startsWith("starter-") ? undefined : puzzle._id,
    puzzleExternalId: puzzle.externalId || puzzle._id,
    trainerType: isKingHunt ? "king_hunt" : "tactics",
    mateIn: isKingHunt ? mateIn : undefined,
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
    sourceType: isKingHunt ? "king_hunt" : "tactics_trainer",
    sourceId: attempt._id,
    xp: reward.xp,
    coins: reward.coins,
    badge: reward.badge,
    reason: `${isKingHunt ? "King Hunt" : "Tactics Trainer"}: ${solved ? "solved" : "attempted"} ${puzzle.externalId || puzzle._id} (${reward.xp} XP)`,
  });

  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: isKingHunt ? "king_hunt.completed" : "tactics_trainer.completed",
    label: `${solved ? "Solved" : "Attempted"} ${isKingHunt ? "King Hunt" : "tactics"} puzzle ${puzzle.externalId || puzzle._id}`,
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
