import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, ".env"));

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "envision_chess";

if (!uri && !dryRun) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const sources = [
  {
    filePath: "scripts/import-data/Notation-Writing-MCQ.pgn",
    title: "Notation Writing HW",
    topicName: "Notation Writing",
    importBatchId: "notation-writing-fen-mcq-hw",
  },
  {
    filePath: "scripts/import-data/En-Passant-Day-1-MCQ.pgn",
    title: "En-Passant day 1 HW",
    topicName: "En-Passant day 1",
    importBatchId: "en-passant-day-1-fen-mcq-hw",
  },
];

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function normalizeTopicKey(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\bhw\b/gi, "")
    .replace(/\bhomework\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function header(gameText, name) {
  return gameText.match(new RegExp(`\\[${name}\\s+"([^"]*)"\\]`))?.[1] || "";
}

function commentBlocks(gameText) {
  return [...gameText.matchAll(/\{([\s\S]*?)\}/g)].map((match) => match[1].trim());
}

function parseQuestionComment(comment) {
  const mcqIndex = comment.search(/MCQ\s*:/i);
  if (mcqIndex < 0) throw new Error(`Missing MCQ marker in comment: ${comment.slice(0, 80)}`);
  const mcqText = comment.slice(mcqIndex).replace(/^MCQ\s*:\s*/i, "");
  const optionStart = mcqText.search(/\n\s*A\)/i);
  if (optionStart < 0) throw new Error(`Missing options in comment: ${comment.slice(0, 80)}`);
  const question = cleanText(mcqText.slice(0, optionStart));
  const optionsText = mcqText.slice(optionStart);
  const options = {};
  for (const match of optionsText.matchAll(/^\s*([A-D])\)\s*(.+)$/gim)) {
    options[match[1].toUpperCase()] = cleanText(match[2]);
  }
  for (const id of ["A", "B", "C", "D"]) {
    if (!options[id]) throw new Error(`Missing option ${id} for question: ${question}`);
  }
  return { question, options };
}

function parseAnswer(comment) {
  const match = comment.match(/Correct\s+Answer\s*:\s*([A-D])(?:\)|\.|\b)/i);
  if (!match) throw new Error(`Missing correct answer in comment: ${comment.slice(0, 80)}`);
  return match[1].toUpperCase();
}

function parseFenMcqPgn(filePath) {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const pgn = fs.readFileSync(resolvedPath, "utf8");
  return pgn
    .split(/\n\s*(?=\[Event\s+")/g)
    .map((gameText, index) => {
      const fen = header(gameText, "FEN");
      const title = header(gameText, "ChapterName") || `Question ${index + 1}`;
      const comments = commentBlocks(gameText);
      if (!fen || comments.length < 2) throw new Error(`Could not parse game ${index + 1} in ${filePath}`);
      const parsed = parseQuestionComment(comments[0]);
      const answer = parseAnswer(comments.at(-1));
      return {
        id: `q${index + 1}`,
        title,
        question: parsed.question,
        positionFen: fen,
        options: ["A", "B", "C", "D"].map((id) => ({ id, text: parsed.options[id], correct: id === answer })),
        multipleCorrect: false,
        correctAnswers: [["A", "B", "C", "D"].indexOf(answer)],
        explanation: comments.at(-1).replace(/Correct\s+Answer\s*:\s*/i, "").trim(),
        points: 1,
      };
    });
}

function findLevelAndTopic(course, wantedTopicName) {
  const wantedKey = normalizeTopicKey(wantedTopicName);
  for (const level of course?.levels || []) {
    const topic = (level.topics || []).find((item) => normalizeTopicKey(item.name) === wantedKey);
    if (topic) return { level, topic };
  }
  return { level: null, topic: null };
}

async function main() {
  if (dryRun) {
    for (const source of sources) {
      const items = parseFenMcqPgn(source.filePath);
      console.log(`Parsed: ${source.title} (${items.length} questions)`);
    }
    return;
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const courses = db.collection("courses");
    const assignmentTemplates = db.collection("assignmenttemplates");
    const users = db.collection("users");

    const course = await courses.findOne({ name: /^Beginners? Course$/i, isActive: { $ne: false } });
    if (!course) throw new Error("Active Beginner/Beginners Course was not found.");

    const admin = await users.findOne({ role: "admin" }, { projection: { _id: 1 } });
    const now = new Date();

    for (const source of sources) {
      const items = parseFenMcqPgn(source.filePath);
      const { level, topic } = findLevelAndTopic(course, source.topicName);
      const topicName = topic?.name || source.topicName;
      const topicKey = normalizeTopicKey(topicName);
      const payload = {
        title: source.title,
        description: `FEN-based MCQ homework template for ${topicName}.`,
        instructions: "Look at the board and choose the correct answer.",
        course: course._id,
        courseName: course.name,
        level: course.level || "beginner",
        levelName: level?.name || "",
        topicName,
        topicKey,
        activities: [
          {
            type: "quiz",
            title: source.title,
            instructions: "Look at the board and choose the correct answer.",
            difficulty: "beginner",
            points: 1,
            timeLimitMinutes: 0,
            topic: topicName,
            source: { kind: "fen_mcq", importBatchId: source.importBatchId },
            items,
          },
        ],
        puzzles: [],
        numberOfAttempts: 1,
        timeLimitMinutes: 0,
        targetMode: "classroom_batches",
        defaultBatches: [],
        defaultStudents: [],
        duePolicy: { type: "before_next_class", minutesBefore: 1, daysAfterClass: 7, noNextClassBehavior: "assign_without_due" },
        autoAssign: true,
        isActive: true,
        linkStatus: topic ? "linked" : "unlinked",
        source: { kind: "mcq_import", pgnIds: [], fileNames: [path.basename(source.filePath)], importBatchId: source.importBatchId },
        updatedBy: admin?._id,
        updatedAt: now,
      };

      const result = await assignmentTemplates.updateOne(
        { topicKey, "source.importBatchId": source.importBatchId },
        { $set: payload, $setOnInsert: { createdBy: admin?._id, createdAt: now } },
        { upsert: true }
      );

      console.log(`${result.upsertedCount ? "Created" : "Updated"}: ${payload.title} (${items.length} questions, ${payload.linkStatus}${payload.levelName ? `, ${payload.levelName}` : ""})`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
