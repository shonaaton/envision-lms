import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ExplorerMove = {
  uci?: string;
  san?: string;
  white?: number;
  draws?: number;
  black?: number;
};

function moveTotal(move: ExplorerMove) {
  return Number(move.white || 0) + Number(move.draws || 0) + Number(move.black || 0);
}

function resultScore(move: ExplorerMove, turn: "w" | "b") {
  const total = moveTotal(move);
  if (!total) return 0;
  const wins = turn === "w" ? Number(move.white || 0) : Number(move.black || 0);
  return (wins + Number(move.draws || 0) * 0.5) / total;
}

function pickOpeningMove(moves: ExplorerMove[], turn: "w" | "b", level: number) {
  const minGames = level >= 8 ? 25 : level >= 6 ? 10 : 3;
  const candidates = moves
    .filter((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(move.uci || "")))
    .filter((move) => moveTotal(move) >= minGames)
    .map((move) => ({
      move,
      total: moveTotal(move),
      score: resultScore(move, turn),
    }))
    .filter((item) => item.score >= (level >= 8 ? 0.42 : 0.34))
    .sort((a, b) => {
      const aRank = a.score * 100 + Math.log10(a.total + 1) * (level >= 8 ? 16 : 24);
      const bRank = b.score * 100 + Math.log10(b.total + 1) * (level >= 8 ? 16 : 24);
      return bRank - aRank;
    });

  return candidates[0]?.move || null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const moves = Array.isArray(body?.moves) ? body.moves.map(String).filter(Boolean) : [];
  const turn = body?.turn === "b" ? "b" : "w";
  const level = Math.max(1, Math.min(9, Number(body?.level || 1)));

  if (moves.length > 18 || level < 4) return NextResponse.json({ move: null });

  const params = new URLSearchParams({
    variant: "standard",
    speeds: "rapid,classical,correspondence",
    play: moves.join(","),
  });

  try {
    const response = await fetch(`https://explorer.lichess.ovh/masters?${params}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) return NextResponse.json({ move: null });

    const payload = await response.json();
    const selected = pickOpeningMove(Array.isArray(payload?.moves) ? payload.moves : [], turn, level);
    return NextResponse.json({
      move: selected?.uci || null,
      san: selected?.san || null,
      opening: payload?.opening?.name || null,
    });
  } catch {
    return NextResponse.json({ move: null });
  }
}
