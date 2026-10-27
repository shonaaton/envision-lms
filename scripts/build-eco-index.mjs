#!/usr/bin/env node
/**
 * Builds src/lib/openings/ecoIndex.json from the lichess opening names.
 *
 *   node scripts/build-eco-index.mjs <folder holding a.tsv ... e.tsv>
 *
 * The TSVs come from https://github.com/lichess-org/chess-openings (CC0). Each
 * row is `eco <tab> name <tab> pgn`. The index maps the position the line
 * reaches (an EPD: board, side to move, castling, en passant) to its name, so
 * the openings player can say "Italian Game: Giuoco Piano" however the moves
 * got there.
 *
 * Rerun it only to pick up a newer lichess release; the JSON is committed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error("Usage: node scripts/build-eco-index.mjs <folder with a.tsv..e.tsv>");
  process.exit(1);
}

const out = resolve(fileURLToPath(new URL("..", import.meta.url)), "src/lib/openings/ecoIndex.json");
const index = {};
let rows = 0;
let transpositions = 0;

for (const file of ["a", "b", "c", "d", "e"]) {
  const lines = readFileSync(join(sourceDir, `${file}.tsv`), "utf8").split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split("\t");
    const game = new Chess();
    for (const token of pgn.split(/\s+/)) {
      if (!token || /^\d+\.+$/.test(token)) continue;
      game.move(token);
    }
    const epd = game.fen().split(" ").slice(0, 4).join(" ");
    rows += 1;
    // A position reached by two lines keeps the first (lichess lists the main
    // name before its transpositions within a file).
    if (index[epd]) {
      transpositions += 1;
      continue;
    }
    index[epd] = [eco, name];
  }
}

writeFileSync(out, `${JSON.stringify(index)}\n`);
console.log(`${rows} lines, ${Object.keys(index).length} positions (${transpositions} transpositions kept as the first name) -> ${out}`);
