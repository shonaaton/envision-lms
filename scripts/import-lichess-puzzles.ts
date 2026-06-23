import fs from "node:fs";
import readline from "node:readline";
import { dbConnect } from "../src/lib/db";
import { TacticPuzzle } from "../src/models/TacticPuzzle";

type ImportOptions = {
  file: string;
  limit: number;
  minRating: number;
  maxRating: number;
  minPopularity: number;
  themes: string[];
};

function parseOptions(): ImportOptions {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value = ""] = arg.slice(2).split("=");
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }
  return {
    file: positional[0] || "",
    limit: Number(positional[1] || flags.limit || 0),
    minRating: Number(flags.minRating || 0),
    maxRating: Number(flags.maxRating || 2200),
    minPopularity: Number(flags.minPopularity || -100),
    themes: flags.themes ? flags.themes.split(",").map((item) => item.trim()).filter(Boolean) : [],
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

async function main() {
  const options = parseOptions();
  const file = options.file;
  const limit = options.limit;
  if (!file || !fs.existsSync(file)) {
    console.error("Usage: npm run import:puzzles -- <lichess_db_puzzle.csv> [limit] --maxRating=1600 --minPopularity=50 --themes=mate,fork");
    process.exit(1);
  }

  await dbConnect();
  console.log(`Importing ${file}`);
  console.log(`Filters: limit=${limit || "all"}, rating=${options.minRating}-${options.maxRating}, minPopularity=${options.minPopularity}, themes=${options.themes.join(",") || "any"}`);
  const stream = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let imported = 0;
  let scanned = 0;
  let skippedHeader = false;
  let batch: any[] = [];

  for await (const line of stream) {
    if (!skippedHeader) {
      skippedHeader = true;
      if (line.startsWith("PuzzleId,")) continue;
    }
    if (!line.trim()) continue;
    scanned += 1;
    const [externalId, fen, moves, rating, ratingDeviation, popularity, nbPlays, themes, gameUrl, openingTags] = parseCsvLine(line);
    if (!externalId || !fen || !moves) continue;
    const numericRating = Number(rating || 0);
    const numericPopularity = Number(popularity || 0);
    const themeList = themes ? themes.split(/\s+/).filter(Boolean) : [];
    if (numericRating < options.minRating || numericRating > options.maxRating) continue;
    if (numericPopularity < options.minPopularity) continue;
    if (options.themes.length && !options.themes.some((theme) => themeList.includes(theme))) continue;

    batch.push({
      updateOne: {
        filter: { source: "lichess", externalId },
        update: {
          $set: {
            source: "lichess",
            externalId,
            fen,
            moves: moves.split(/\s+/).filter(Boolean),
            rating: numericRating,
            ratingDeviation: Number(ratingDeviation || 0),
            popularity: numericPopularity,
            nbPlays: Number(nbPlays || 0),
            themes: themeList,
            gameUrl,
            openingTags: openingTags ? openingTags.split(/\s+/).filter(Boolean) : [],
            isActive: true,
          },
        },
        upsert: true,
      },
    });
    const batchSize = limit ? Math.min(1000, Math.max(1, limit - imported)) : 1000;
    if (batch.length >= batchSize) {
      await TacticPuzzle.bulkWrite(batch, { ordered: false });
      imported += batch.length;
      console.log(`Imported ${imported} (scanned ${scanned})`);
      batch = [];
      if (limit && imported >= limit) break;
    }
  }

  if (batch.length && (!limit || imported < limit)) {
    await TacticPuzzle.bulkWrite(batch, { ordered: false });
    imported += batch.length;
  }
  console.log(`Done. Imported/updated ${imported} puzzles. Scanned ${scanned} rows.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
