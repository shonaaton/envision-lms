import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "envision_chess";

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
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

function option(id, text, correctId) {
  return { id, text, correct: id === correctId };
}

function mcqItems(questions) {
  return questions.map((question, index) => ({
    id: `q${index + 1}`,
    title: `Question ${index + 1}`,
    question: question.question,
    options: [
      option("A", question.options.A, question.answer),
      option("B", question.options.B, question.answer),
      option("C", question.options.C, question.answer),
      option("D", question.options.D, question.answer),
    ],
    multipleCorrect: false,
    correctAnswers: ["A", "B", "C", "D"].indexOf(question.answer) >= 0 ? [["A", "B", "C", "D"].indexOf(question.answer)] : [],
    points: 1,
  }));
}

const templates = [
  {
    displayTitle: "Introduction to Chess, Chessboard, Files, Ranks and Diagonals",
    courseTopicName: "Introduction to the course ,Introduction to the game & historyIntroduction to the board",
    questions: [
      { question: "How many squares are there on a chessboard?", options: { A: "32", B: "48", C: "64", D: "100" }, answer: "C" },
      { question: "How many files are there on a chessboard?", options: { A: "6", B: "8", C: "10", D: "12" }, answer: "B" },
      { question: "Files are identified using:", options: { A: "Numbers from 1 to 8", B: "Letters from a to h", C: "Colours", D: "Chess-piece symbols" }, answer: "B" },
      { question: "Ranks are identified using:", options: { A: "Letters from a to h", B: "Numbers from 1 to 8", C: "Piece symbols", D: "Player names" }, answer: "B" },
      { question: "A diagonal is a line of squares that runs:", options: { A: "Only vertically", B: "Only horizontally", C: "Slantwise", D: "Around the edge of the board" }, answer: "C" },
      { question: "Which of the following is one of the four centre squares?", options: { A: "a1", B: "h8", C: "d4", D: "b2" }, answer: "C" },
      { question: "Which group contains all four main centre squares?", options: { A: "a1, a8, h1, h8", B: "d4, e4, d5, e5", C: "c3, c6, f3, f6", D: "a4, a5, h4, h5" }, answer: "B" },
      { question: "What should be the colour of the bottom-right square when the chessboard is placed correctly?", options: { A: "Dark", B: "Light", C: "Red", D: "Green" }, answer: "B" },
      { question: "How many light-coloured squares are there on a chessboard?", options: { A: "16", B: "24", C: "32", D: "64" }, answer: "C" },
      { question: "Chess is believed to have developed from an ancient Indian game called:", options: { A: "Ludo", B: "Chaturanga", C: "Carrom", D: "Checkers" }, answer: "B" },
    ],
  },
  {
    displayTitle: "Chess Pieces, Values, Symbols and Setting Up the Board",
    courseTopicName: "Introduction the the pieces & Values, Symbol of the Pieces, Setting Up A Board",
    questions: [
      { question: "How many pieces does each player have at the beginning of a chess game?", options: { A: "8", B: "12", C: "16", D: "20" }, answer: "C" },
      { question: "Which chess piece is generally valued at 1 point?", options: { A: "Knight", B: "Pawn", C: "Rook", D: "Queen" }, answer: "B" },
      { question: "What is the usual value of a knight?", options: { A: "1 point", B: "3 points", C: "5 points", D: "9 points" }, answer: "B" },
      { question: "What is the usual value of a rook?", options: { A: "3 points", B: "4 points", C: "5 points", D: "9 points" }, answer: "C" },
      { question: "Which is the most valuable attacking piece?", options: { A: "Bishop", B: "Knight", C: "Rook", D: "Queen" }, answer: "D" },
      { question: "Which symbol is used for the king in chess notation?", options: { A: "K", B: "G", C: "Kg", D: "No symbol" }, answer: "A" },
      { question: "Which symbol is used for the knight in chess notation?", options: { A: "K", B: "N", C: "Kn", D: "T" }, answer: "B" },
      { question: "Where are the rooks placed at the beginning of the game?", options: { A: "In the centre", B: "In the four corners", C: "Next to the king", D: "In front of the pawns" }, answer: "B" },
      { question: "Where should the queen be placed during the initial setup?", options: { A: "On a square of the opposite colour", B: "On the corner square", C: "On a square matching her own colour", D: "Next to a rook" }, answer: "C" },
      { question: "Which is the correct order of White's pieces from a1 to h1?", options: { A: "Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook", B: "Rook, Bishop, Knight, King, Queen, Knight, Bishop, Rook", C: "Knight, Rook, Bishop, Queen, King, Bishop, Rook, Knight", D: "Rook, Knight, Queen, Bishop, King, Bishop, Knight, Rook" }, answer: "A" },
    ],
  },
];

function findLevelAndTopic(course, courseTopicName) {
  for (const level of course?.levels || []) {
    const topic = (level.topics || []).find((item) => normalizeTopicKey(item.name) === normalizeTopicKey(courseTopicName));
    if (topic) return { level, topic };
  }
  return { level: null, topic: null };
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const courses = db.collection("courses");
    const assignmentTemplates = db.collection("assignmenttemplates");
    const users = db.collection("users");

    const course = await courses.findOne({ name: /^Beginner Course$/i, isActive: { $ne: false } });
    if (!course) throw new Error("Active Beginner Course was not found.");

    const admin = await users.findOne({ role: "admin" }, { projection: { _id: 1 } });
    const now = new Date();

    for (const template of templates) {
      const { level, topic } = findLevelAndTopic(course, template.courseTopicName);
      const topicName = topic?.name || template.courseTopicName;
      const topicKey = normalizeTopicKey(topicName);
      const activityItems = mcqItems(template.questions);
      const payload = {
        title: `${template.displayTitle} - MCQ`,
        description: `MCQ homework template for ${template.displayTitle}.`,
        instructions: "Choose the correct answer for each question.",
        course: course._id,
        courseName: course.name,
        level: course.level || "beginner",
        levelName: level?.name || "Beginner Level1",
        topicName,
        topicKey,
        activities: [
          {
            type: "quiz",
            title: `${template.displayTitle} MCQ`,
            instructions: "Choose the correct answer for each question.",
            difficulty: "beginner",
            points: 1,
            timeLimitMinutes: 0,
            topic: topicName,
            source: { kind: "mcq", importBatchId: "beginner-foundation-mcq-templates" },
            items: activityItems,
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
        source: { kind: "mcq_import", pgnIds: [], fileNames: [], importBatchId: "beginner-foundation-mcq-templates" },
        updatedBy: admin?._id,
        updatedAt: now,
      };

      const result = await assignmentTemplates.updateOne(
        { topicKey, "source.kind": "mcq_import" },
        { $set: payload, $setOnInsert: { createdBy: admin?._id, createdAt: now } },
        { upsert: true }
      );

      console.log(`${result.upsertedCount ? "Created" : "Updated"}: ${payload.title} (${payload.linkStatus}, ${payload.levelName})`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
