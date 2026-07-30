import { loadEnvConfig } from "@next/env";
import fs from "fs/promises";
import path from "path";
import { dbConnect } from "../src/lib/db";
import { normalizeFolderPath } from "../src/lib/pgnLibrary";
import { isValidPgnOrFenSetup, splitPgnGames, summarizePgn } from "../src/lib/pgnLibrary";
import { PGN } from "../src/models/PGN";
import { User } from "../src/models/User";

loadEnvConfig(process.cwd());

const sourceRoot = "E:\\PGN Downloader\\PGNs";
const masterFolder = "Beginners Course";

type ImportRow = {
  filePath: string;
  fileName: string;
  folder: string;
  pgn: string;
};

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.pgn$/i, "").replace(/\s+/g, " ").trim();
}

function normalizeSourceFolder(folderName: string) {
  const clean = folderName.replace(/Bgeinner/i, "Beginner").replace(/\s+/g, " ").trim();
  const level = clean.match(/Beginner Level\s*(\d+)/i)?.[1] || "Unsorted";
  const type = /\bHW\b/i.test(clean) ? "HW" : /\bCW\b/i.test(clean) ? "CW" : "Unsorted";
  return normalizeFolderPath(`${masterFolder}/Beginner Level ${level}/${type}`);
}

async function collectPgnFiles(dir: string): Promise<ImportRow[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const rows: ImportRow[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rows.push(...await collectPgnFiles(fullPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pgn")) continue;
    const relative = path.relative(sourceRoot, fullPath);
    const sourceFolder = relative.split(path.sep)[0] || "";
    rows.push({
      filePath: fullPath,
      fileName: entry.name,
      folder: normalizeSourceFolder(sourceFolder),
      pgn: await fs.readFile(fullPath, "utf8"),
    });
  }
  return rows;
}

async function resolveUploader() {
  const user = await User.findOne({ role: "admin", isSuperAdmin: true }).sort({ createdAt: 1 }) ||
    await User.findOne({ role: "admin" }).sort({ createdAt: 1 }) ||
    await User.findOne({ role: "instructor" }).sort({ createdAt: 1 });
  if (!user) throw new Error("No admin or instructor user found to own imported PGNs.");
  return user;
}

async function main() {
  await dbConnect();
  const uploader = await resolveUploader();
  const rows = await collectPgnFiles(sourceRoot);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const invalid: string[] = [];

  for (const row of rows) {
    const games = splitPgnGames(row.pgn);
    if (!games.length) {
      skipped += 1;
      invalid.push(row.filePath);
      continue;
    }
    for (const [index, game] of games.entries()) {
      if (!isValidPgnOrFenSetup(game)) {
        skipped += 1;
        invalid.push(`${row.filePath}${games.length > 1 ? `#${index + 1}` : ""}`);
        continue;
      }
      const fallbackTitle = titleFromFileName(row.fileName);
      const summary = summarizePgn(game, fallbackTitle);
      const title = games.length > 1
        ? summary.event || summary.title || `${fallbackTitle} ${index + 1}`
        : fallbackTitle || summary.title || "Untitled PGN";
      const existing = await PGN.findOne({
        uploadedBy: uploader._id,
        folder: row.folder,
        sourceFileName: row.fileName,
        title,
      });
      const payload = {
        ...summary,
        title,
        pgn: game,
        folder: row.folder,
        sourceFileName: row.fileName,
        description: `Imported into ${masterFolder}`,
        tags: [masterFolder, row.folder.includes("/HW") ? "HW" : "CW", row.folder.split("/")[1] || "Beginner"],
        visibility: "shared",
        uploadedBy: uploader._id,
      };
      if (existing) {
        existing.set(payload);
        await existing.save();
        updated += 1;
      } else {
        await PGN.create(payload);
        created += 1;
      }
    }
  }

  console.log(JSON.stringify({
    uploader: { id: String(uploader._id), name: uploader.name, email: uploader.email, role: uploader.role },
    files: rows.length,
    created,
    updated,
    skipped,
    invalid,
    folders: Array.from(new Set(rows.map((row) => row.folder))).sort(),
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
