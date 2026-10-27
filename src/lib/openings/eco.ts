import "server-only";
import ecoIndex from "./ecoIndex.json";
import type { EcoName } from "./engine";

/**
 * Opening names from lichess-org/chess-openings (CC0), keyed by position.
 * Built by scripts/build-eco-index.mjs. Server-only: the file is ~450 KB and
 * the player only ever needs the names along one chapter, which the server
 * resolves before sending the chapter down.
 */
const index = ecoIndex as unknown as Record<string, [eco: string, name: string]>;

/** The lichess name for exactly this position (ignoring the move counters), if it has one. */
export function ecoAt(fen: string): EcoName | null {
  const epd = fen.split(" ").slice(0, 4).join(" ");
  const entry = index[epd];
  return entry ? { eco: entry[0], name: entry[1] } : null;
}
