import { Homework } from "@/models/Homework";

export const DEMO_HOMEWORK_TITLE = "Demo Class Warm-Up";

/**
 * PGN board tasks the student plays out move by move.
 *
 * The player replays these with `loadPgn` and expects the student to find each
 * of White's moves while it answers with Black's, so every line here is written
 * from White's side and kept short: two tactics a beginner can find, and one
 * opening walk-through that rewards the principles the MCQs just asked about.
 */
const demoPgnItems = [
  {
    id: "demo-pgn-1",
    title: "Back-rank mate in one",
    pgn: [
      '[Event "Demo Class Warm-Up"]',
      '[Site "Envision Chess Academy"]',
      '[White "You"]',
      '[Black "Computer"]',
      '[Result "1-0"]',
      '[SetUp "1"]',
      '[FEN "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"]',
      "",
      "1. Ra8# 1-0",
    ].join("\n"),
  },
  {
    id: "demo-pgn-2",
    title: "Knight fork wins the queen",
    pgn: [
      '[Event "Demo Class Warm-Up"]',
      '[Site "Envision Chess Academy"]',
      '[White "You"]',
      '[Black "Computer"]',
      '[Result "1-0"]',
      '[SetUp "1"]',
      '[FEN "7k/4qppp/8/4N3/8/8/6PP/6K1 w - - 0 1"]',
      "",
      "1. Ng6+ Kg8 2. Nxe7+ 1-0",
    ].join("\n"),
  },
  {
    id: "demo-pgn-3",
    title: "Opening principles in action",
    pgn: [
      '[Event "Demo Class Warm-Up"]',
      '[Site "Envision Chess Academy"]',
      '[White "You"]',
      '[Black "Computer"]',
      '[Result "*"]',
      "",
      "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 *",
    ].join("\n"),
  },
];

/**
 * The starter assignment every demo student receives with their demo classroom.
 *
 * A demo student can already try the practice tools, but homework is the part of
 * the portal a parent actually asks about - "what will my child be given after
 * class?" - and describing it in a sample screenshot never answered that. So the
 * demo gets a real Homework document on the real classroom: the same player, the
 * same submission flow, the same coach review afterwards.
 *
 * It is deliberately short - a few MCQs, three PGN board puzzles, and two
 * written questions for the coach - so it can be finished in a few minutes
 * before or after the demo class.
 */
export function demoHomeworkActivities() {
  return [
    {
      type: "quiz",
      title: "Opening principles check",
      instructions: "Three quick questions on how to start a chess game well. Pick the best answer for each.",
      difficulty: "beginner",
      points: 5,
      topic: "Opening principles",
      items: [
        {
          id: "demo-mcq-1",
          title: "First moves",
          question: "In the opening, which of these is the most useful first priority?",
          options: [
            { id: "a", text: "Control the centre and develop your pieces", correct: true },
            { id: "b", text: "Move the same knight three or four times", correct: false },
            { id: "c", text: "Push the rook pawns on both sides", correct: false },
            { id: "d", text: "Bring the queen out on move two", correct: false },
          ],
          explanation: "Centre control and fast development give every other plan something to stand on.",
          points: 1,
        },
        {
          id: "demo-mcq-2",
          title: "King safety",
          question: "You have developed both knights and a bishop. What is usually the next best idea?",
          options: [
            { id: "a", text: "Castle to bring the king to safety", correct: true },
            { id: "b", text: "Start a pawn storm in front of your own king", correct: false },
            { id: "c", text: "Trade every piece you can", correct: false },
            { id: "d", text: "Move the rook pawn to make luft", correct: false },
          ],
          explanation: "Castling tucks the king away and connects the rooks - it is the standard follow-up to development.",
          points: 1,
        },
        {
          id: "demo-mcq-3",
          title: "Counting material",
          question: "You can win a rook but you will lose a bishop and a knight doing it. Is that a good trade?",
          options: [
            { id: "a", text: "No - two minor pieces are usually worth more than a rook", correct: true },
            { id: "b", text: "Yes - a rook is always the strongest piece", correct: false },
            { id: "c", text: "Yes - trades are always good when you are behind", correct: false },
            { id: "d", text: "It never matters, only checkmate counts", correct: false },
          ],
          explanation: "A rook is about five points, while a bishop and knight together are about six, and they coordinate well.",
          points: 1,
        },
      ],
    },
    {
      type: "study_pgn",
      title: "Play these three positions",
      instructions: "Find the best move on the board. The computer answers for the other side, and a hint is there if you get stuck - the same board and the same scoring an enrolled student gets.",
      difficulty: "beginner",
      points: 4,
      topic: "Tactics and opening play",
      source: { kind: "pgn_quiz", folder: "Demo" },
      items: demoPgnItems.map((item) => ({
        id: item.id,
        title: item.title,
        pgnTitle: item.title,
        pgn: item.pgn,
        source: { kind: "uploaded_pgn", folder: "Demo" },
        points: 4,
      })),
    },
    {
      type: "written_answer",
      title: "Tell your coach about your chess",
      instructions: "Your coach reads this before the demo class so the session is aimed at the right level.",
      difficulty: "beginner",
      points: 3,
      topic: "Coach intake",
      items: [
        {
          id: "demo-written-1",
          title: "Your chess so far",
          question: "How long have you been playing chess, and where do you play most - school, club, Chess.com, or Lichess?",
          expectedAnswer: "",
          points: 2,
        },
        {
          id: "demo-written-2",
          title: "What you want to improve",
          question: "What is the one thing you would most like to get better at? For example openings, tactics, endgames, or losing on time.",
          expectedAnswer: "",
          points: 1,
        },
      ],
    },
  ];
}

/**
 * Attach the starter assignment to a demo classroom exactly once.
 *
 * Keyed on the classroom rather than the booking so re-approving or rescheduling
 * a demo never hands the student a second copy of the same homework, and so a
 * demo student who already answered it keeps their submission.
 */
export async function ensureDemoHomework(input: {
  classroomId: unknown;
  coachId: unknown;
  studentId: unknown;
  dueAt?: Date;
}) {
  if (!input.classroomId || !input.coachId || !input.studentId) return null;
  const existing: any = await Homework.findOne({ classroom: input.classroomId, title: DEMO_HOMEWORK_TITLE }).lean();
  if (existing) return existing;
  return Homework.create({
    classroom: input.classroomId,
    instructor: input.coachId,
    type: "quiz",
    title: DEMO_HOMEWORK_TITLE,
    description: "A short assignment attached to your demo class - multiple choice, three board puzzles played out on a real chessboard, and two questions for your coach - so you can see exactly how homework works in the portal.",
    instructions: "Answer the questions, play the board tasks, then press Submit. Your coach can see the result and reply with feedback, the same way it works after enrollment.",
    assignedStudents: [input.studentId],
    dueAt: input.dueAt,
    numberOfAttempts: 3,
    timeLimitMinutes: 0,
    activities: demoHomeworkActivities(),
    isPublished: true,
  });
}
