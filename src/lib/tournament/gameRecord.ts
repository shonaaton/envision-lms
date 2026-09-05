import type { ScoredGame } from "./scoring";

/**
 * Normalise a stored game (or a lean projection, or a JSON payload sent to the
 * browser) into the plain record the scoring functions take.
 *
 * Kept free of mongoose so client components can score a game with exactly the
 * same code the server uses.
 */
export function toScoredGame(game: any): ScoredGame {
  return {
    id: String(game?._id ?? game?.id ?? ""),
    source: game?.source === "arena" ? "arena" : "swiss",
    status: String(game?.status || ""),
    result: game?.result || "*",
    termination: String(game?.termination || ""),
    whiteKey: String(game?.whiteKey || ""),
    blackKey: String(game?.blackKey || ""),
    plyCount: Number(game?.ply ?? (game?.moveHistorySAN || []).length ?? 0),
    berserkWhite: Boolean(game?.berserkWhite),
    berserkBlack: Boolean(game?.berserkBlack),
    endedAt: new Date(game?.endedAt || game?.updatedAt || game?.createdAt || 0).getTime(),
  };
}
