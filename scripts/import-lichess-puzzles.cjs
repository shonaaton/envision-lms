const fs = require("node:fs");
const readline = require("node:readline");
const mongoose = require("mongoose");

const TacticPuzzleSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ["lichess", "manual"], default: "lichess", index: true },
    externalId: { type: String, index: true },
    fen: { type: String, required: true },
    moves: [{ type: String, required: true }],
    rating: { type: Number, default: 1000, index: true },
    ratingDeviation: { type: Number, default: 0 },
    popularity: { type: Number, default: 0 },
    nbPlays: { type: Number, default: 0 },
    themes: [{ type: String, index: true }],
    gameUrl: String,
    openingTags: [{ type: String }],
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

TacticPuzzleSchema.index({ source: 1, externalId: 1 }, { unique: true, sparse: true });
TacticPuzzleSchema.index({ rating: 1, popularity: -1 });

const TacticPuzzle = mongoose.models.TacticPuzzle || mongoose.model("TacticPuzzle", TacticPuzzleSchema);

function parseOptions() {
  const positional = [];
  const flags = {};
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

function parseCsvLine(line) {
  const cells = [];
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
  if (!options.file || !fs.existsSync(options.file)) {
    console.error("Usage: node scripts/import-lichess-puzzles.cjs <lichess_db_puzzle.csv> [limit] --maxRating=1600 --minPopularity=50 --themes=mate,fork");
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || undefined,
    bufferCommands: false,
  });

  console.log(`Importing ${options.file}`);
  console.log(`Filters: limit=${options.limit || "all"}, rating=${options.minRating}-${options.maxRating}, minPopularity=${options.minPopularity}, themes=${options.themes.join(",") || "any"}`);

  const stream = readline.createInterface({ input: fs.createReadStream(options.file), crlfDelay: Infinity });
  let imported = 0;
  let scanned = 0;
  let skippedHeader = false;
  let batch = [];

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

    const batchSize = options.limit ? Math.min(1000, Math.max(1, options.limit - imported)) : 1000;
    if (batch.length >= batchSize) {
      await TacticPuzzle.bulkWrite(batch, { ordered: false });
      imported += batch.length;
      console.log(`Imported ${imported} (scanned ${scanned})`);
      batch = [];
      if (options.limit && imported >= options.limit) break;
    }
  }

  if (batch.length && (!options.limit || imported < options.limit)) {
    await TacticPuzzle.bulkWrite(batch, { ordered: false });
    imported += batch.length;
  }

  console.log(`Done. Imported/updated ${imported} puzzles. Scanned ${scanned} rows.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
