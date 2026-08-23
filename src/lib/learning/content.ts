import { LearningExercise, LearningLesson, LearningSection } from "@/models/Learning";

const LEARNING_CONTENT_VERSION = 2;

type AuthoredExercise = {
  startingPosition?: string;
  orientation?: "white" | "black";
  sideToMove?: "white" | "black";
  goalConfig?: Record<string, unknown>;
  acceptedMoves?: string[];
  explanation: string;
  hint: string;
};

type SeedSection = {
  stableKey: string;
  name: string;
  slug: string;
  description: string;
  order: number;
  lessons: Array<{
    stableKey: string;
    name: string;
    slug: string;
    description: string;
    introContent: string;
    order: number;
    icon: string;
    exerciseCount: number;
    rulesMode: "MOVEMENT_TRAINER" | "LEGAL_CHESS" | "QUESTION";
    interactionMode: "BOARD_MOVE" | "BOARD_SEQUENCE" | "COLLECT_TARGETS" | "MULTIPLE_CHOICE" | "SELECT_SQUARE" | "INFORMATION";
    goalType: string;
  }>;
};

const sections: SeedSection[] = [
  {
    stableKey: "pieces",
    name: "Pieces",
    slug: "pieces",
    description: "Learn how each chess piece moves, captures, and controls the board.",
    order: 1,
    lessons: [
      { stableKey: "pieces.pawn", name: "Pawn", slug: "pawn", description: "Start with the pawn's forward movement and captures.", introContent: "Build confidence with the smallest piece on the board.", order: 1, icon: "pawn", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "BOARD_MOVE", goalType: "REACH_SQUARE" },
      { stableKey: "pieces.rook", name: "Rook", slug: "rook", description: "Master horizontal and vertical movement.", introContent: "Use the rook to travel in straight lines and collect targets.", order: 2, icon: "rook", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "BOARD_MOVE", goalType: "REACH_SQUARE" },
      { stableKey: "pieces.bishop", name: "Bishop", slug: "bishop", description: "Practice diagonal movement and blocked paths.", introContent: "See how bishops glide diagonally across the board.", order: 3, icon: "bishop", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "BOARD_MOVE", goalType: "REACH_SQUARE" },
      { stableKey: "pieces.queen", name: "Queen", slug: "queen", description: "Combine rook and bishop movement into one powerful piece.", introContent: "Use the queen's full range with control and precision.", order: 4, icon: "queen", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "BOARD_MOVE", goalType: "REACH_SQUARE" },
      { stableKey: "pieces.knight", name: "Knight", slug: "knight", description: "Learn L-shaped movement and jumping over pieces.", introContent: "Knights move differently from every other piece.", order: 5, icon: "knight", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "BOARD_MOVE", goalType: "REACH_SQUARE" },
      { stableKey: "pieces.king", name: "King", slug: "king", description: "Control one square at a time in every direction.", introContent: "Keep the king safe while learning its unique movement.", order: 6, icon: "king", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "BOARD_MOVE", goalType: "REACH_SQUARE" },
    ],
  },
  {
    stableKey: "basic-skills",
    name: "Basic Skills",
    slug: "basic-skills",
    description: "Build board awareness with captures, defenders, and material values.",
    order: 2,
    lessons: [
      { stableKey: "basic.capture", name: "Capture", slug: "capture", description: "Spot free pieces and play the right capture.", introContent: "Capturing is one of the first practical skills every learner needs.", order: 1, icon: "swords", exerciseCount: 6, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "CAPTURE_TARGET" },
      { stableKey: "basic.defend", name: "Defend", slug: "defend", description: "Identify the squares and pieces that need protection.", introContent: "Strong players notice both threats and defenders.", order: 2, icon: "shield", exerciseCount: 6, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "SELECT_CORRECT_SQUARE" },
      { stableKey: "basic.piece-values", name: "Piece Values", slug: "piece-values", description: "Estimate trades using simple material values.", introContent: "Use quick value checks to choose better exchanges.", order: 3, icon: "coins", exerciseCount: 6, rulesMode: "QUESTION", interactionMode: "MULTIPLE_CHOICE", goalType: "MULTIPLE_CHOICE" },
    ],
  },
  {
    stableKey: "king-safety",
    name: "King Safety",
    slug: "king-safety",
    description: "Learn to recognize check, escape danger, and finish with checkmate.",
    order: 3,
    lessons: [
      { stableKey: "king-safety.check", name: "Check", slug: "check", description: "Find moves that attack the king legally.", introContent: "A move gives check when it attacks the opponent's king.", order: 1, icon: "alert", exerciseCount: 7, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "GIVE_CHECK" },
      { stableKey: "king-safety.escape-check", name: "Escape Check", slug: "escape-check", description: "Get the king out of danger with legal responses.", introContent: "Students should practice the three ways to answer check.", order: 2, icon: "escape", exerciseCount: 7, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "ESCAPE_CHECK" },
      { stableKey: "king-safety.checkmate", name: "Checkmate", slug: "checkmate", description: "Recognize finishing patterns and mating nets.", introContent: "Checkmate ends the game, so these patterns deserve repetition.", order: 3, icon: "crown", exerciseCount: 7, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "CHECKMATE" },
    ],
  },
  {
    stableKey: "special-moves",
    name: "Special Moves",
    slug: "special-moves",
    description: "Practice the special rules that make full chess play possible.",
    order: 4,
    lessons: [
      { stableKey: "special.castling", name: "Castling", slug: "castling", description: "Learn when castling is legal and why it matters.", introContent: "Castling is both a king move and a rook move in one.", order: 1, icon: "castle", exerciseCount: 6, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "CASTLE" },
      { stableKey: "special.promotion", name: "Promotion", slug: "promotion", description: "Promote pawns correctly, including underpromotion.", introContent: "Promotion creates new tactical possibilities at the edge of the board.", order: 2, icon: "sparkles", exerciseCount: 7, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "PROMOTE" },
      { stableKey: "special.en-passant", name: "En Passant", slug: "en-passant", description: "Recognize and play en passant at the right moment.", introContent: "This special capture is rare, so learners need focused repetition.", order: 3, icon: "footprints", exerciseCount: 6, rulesMode: "LEGAL_CHESS", interactionMode: "BOARD_MOVE", goalType: "EN_PASSANT" },
    ],
  },
];

function exerciseTitle(lessonName: string, index: number) {
  return `${lessonName} Exercise ${String(index).padStart(2, "0")}`;
}

function difficultyFor(index: number, total: number) {
  if (index <= Math.ceil(total / 3)) return 1 as const;
  if (index <= Math.ceil((total * 2) / 3)) return 2 as const;
  return 3 as const;
}

function movementGoal(goalType: string, lessonName: string, index: number) {
  if (goalType === "COLLECT_TARGETS") {
    return {
      requiredTargets: index % 2 === 0 ? 3 : 2,
      feedback: `${lessonName} movement challenge`,
    };
  }
  return {
    targetSquare: `lesson-${index}`,
    feedback: `${lessonName} movement challenge`,
  };
}

function questionGoal(index: number) {
  const values = [
    { prompt: "Which piece is worth about 5 pawns?", answer: "Rook" },
    { prompt: "Which piece is usually worth about 9 pawns?", answer: "Queen" },
    { prompt: "Which piece is usually worth about 3 pawns?", answer: "Knight" },
  ];
  const item = values[index % values.length];
  return {
    prompt: item.prompt,
    correctOption: item.answer,
  };
}

const authoredExercises: Record<string, AuthoredExercise[]> = {
  "pieces.pawn": [
    { startingPosition: "8/8/8/8/8/8/P7/4K2k w - - 0 1", goalConfig: { targetSquare: "a4" }, acceptedMoves: ["a2a4"], explanation: "A pawn on its starting rank may move two squares when both squares are clear.", hint: "Check whether the pawn is still on its starting rank." },
    { startingPosition: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", goalConfig: { targetSquare: "d5" }, acceptedMoves: ["e4d5"], explanation: "Pawns move forward but capture one square diagonally.", hint: "The black pawn on d5 is a diagonal capture for the white pawn." },
    { startingPosition: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", goalConfig: { targetSquare: "e4" }, acceptedMoves: ["e2e4"], explanation: "From its starting rank, the pawn can advance one or two squares.", hint: "The path in front of the pawn is clear." },
  ],
  "pieces.rook": [
    { startingPosition: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", goalConfig: { targetSquare: "a6" }, acceptedMoves: ["a1a6"], explanation: "The rook travels any number of clear squares along a rank or file.", hint: "Look for a straight vertical path." },
    { startingPosition: "4k3/8/8/8/8/8/8/4K2R w - - 0 1", goalConfig: { targetSquare: "b1" }, acceptedMoves: ["h1b1"], explanation: "A rook can move across the entire rank when no piece blocks it.", hint: "This time the target is on the same rank." },
  ],
  "pieces.bishop": [
    { startingPosition: "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", goalConfig: { targetSquare: "h6" }, acceptedMoves: ["c1h6"], explanation: "The bishop moves diagonally and always stays on the same colour complex.", hint: "Count equal steps horizontally and vertically." },
    { startingPosition: "4k3/8/8/8/8/8/8/4KB2 w - - 0 1", goalConfig: { targetSquare: "b6" }, acceptedMoves: ["f1b5", "f1a6"], explanation: "A bishop may choose any clear square on its diagonal.", hint: "Find a diagonal that lands on the target colour." },
  ],
  "pieces.queen": [
    { startingPosition: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1", goalConfig: { targetSquare: "h5" }, acceptedMoves: ["d1h5"], explanation: "The queen combines the rook's files and ranks with the bishop's diagonals.", hint: "The queen can reach h5 on a diagonal." },
    { startingPosition: "4k3/8/8/8/8/8/8/Q3K3 w - - 0 1", goalConfig: { targetSquare: "a8" }, acceptedMoves: ["a1a8"], explanation: "The queen can also travel straight like a rook.", hint: "Look up the a-file." },
  ],
  "pieces.knight": [
    { startingPosition: "4k3/8/8/8/8/8/8/1N2K3 w - - 0 1", goalConfig: { targetSquare: "c3" }, acceptedMoves: ["b1c3"], explanation: "The knight moves in an L: two squares in one direction, then one sideways.", hint: "Imagine a 2-by-1 rectangle from b1." },
    { startingPosition: "4k3/8/8/8/8/8/8/4KN2 w - - 0 1", goalConfig: { targetSquare: "d2" }, acceptedMoves: ["f1d2"], explanation: "Knights jump over pieces, so only the landing square matters.", hint: "From f1, d2 is two files left and one rank up." },
  ],
  "pieces.king": [
    { startingPosition: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", goalConfig: { targetSquare: "e2" }, acceptedMoves: ["e1e2"], explanation: "The king moves one square in any direction, as long as the destination is safe.", hint: "Choose the square directly in front of the king." },
    { startingPosition: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", goalConfig: { targetSquare: "f2" }, acceptedMoves: ["e1f2"], explanation: "The king can step diagonally by one square.", hint: "Move one file right and one rank up." },
  ],
  "basic.capture": [
    { startingPosition: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", acceptedMoves: ["e4d5"], explanation: "The best capture is the pawn that can be taken safely.", hint: "Look for the opposing piece on a diagonal from your pawn." },
    { startingPosition: "4k3/n7/8/8/8/8/8/R3K3 w - - 0 1", acceptedMoves: ["a1a6"], explanation: "The rook can capture the knight up the open file.", hint: "The a-file is completely open." },
  ],
  "basic.defend": [
    { startingPosition: "4k3/8/8/8/8/8/1p6/R3K3 w - - 0 1", acceptedMoves: ["a1a2"], explanation: "Ra2 places the rook beside the pawn and protects the second rank.", hint: "Bring the rook to the same rank as the pawn." },
  ],
  "king-safety.check": [
    { startingPosition: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1", acceptedMoves: ["d1h5"], explanation: "Qh5+ attacks the king on e8 along the diagonal.", hint: "Find a queen move that attacks e8 without capturing the king." },
    { startingPosition: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", acceptedMoves: ["a1a8"], explanation: "The rook can give check along the eighth rank.", hint: "Move the rook to a8 so it attacks the king across the rank." },
  ],
  "king-safety.escape-check": [
    { startingPosition: "4r1k1/8/8/8/8/8/8/4K3 w - - 0 1", acceptedMoves: ["e1f2"], explanation: "The king escapes the rook's check by moving to a safe square.", hint: "Step away from the e-file." },
  ],
  "king-safety.checkmate": [
    { startingPosition: "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1", acceptedMoves: ["g6g7"], explanation: "Qg7 is checkmate: the queen checks and the king controls the escape squares.", hint: "Place the queen next to the king while your king covers the flight squares." },
  ],
  "special.castling": [
    { startingPosition: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", acceptedMoves: ["e1g1", "e1c1"], explanation: "Castling moves the king two squares toward a rook and brings that rook beside it.", hint: "Both the king and the rook must have clear, safe castling rights." },
  ],
  "special.promotion": [
    { startingPosition: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", acceptedMoves: ["a7a8q"], explanation: "A pawn reaching the last rank must promote to a queen, rook, bishop, or knight.", hint: "Move the pawn to a8 and choose a promotion piece." },
  ],
  "special.en-passant": [
    { startingPosition: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", acceptedMoves: ["e5d6"], explanation: "En passant is available immediately after the opposing pawn advances two squares.", hint: "The en-passant target square in this position is d6." },
  ],
};

function authoredExercise(lesson: SeedSection["lessons"][number], index: number): AuthoredExercise {
  const set = authoredExercises[lesson.stableKey] || [];
  if (set.length) return set[(index - 1) % set.length];
  return {
    explanation: `Choose the answer that best demonstrates the ${lesson.name.toLowerCase()} principle.`,
    hint: `Recall the core idea from the ${lesson.name.toLowerCase()} lesson.`,
  };
}

function buildGoalConfig(lesson: SeedSection["lessons"][number], index: number) {
  if (lesson.rulesMode === "QUESTION") return questionGoal(index);
  if (lesson.rulesMode === "MOVEMENT_TRAINER") return movementGoal(lesson.goalType, lesson.name, index);
  return {
    objective: lesson.goalType,
    lesson: lesson.name,
    step: index,
  };
}

export function learningSeedBlueprint() {
  return sections;
}

export async function ensureLearningSeedData() {
  const currentVersionExists = await LearningExercise.exists({ createdBy: "system.curriculum", version: LEARNING_CONTENT_VERSION });
  if (currentVersionExists) return;

  for (const section of sections) {
    const savedSection = await LearningSection.findOneAndUpdate(
      { stableKey: section.stableKey },
      {
        stableKey: section.stableKey,
        name: section.name,
        slug: section.slug,
        description: section.description,
        order: section.order,
        status: "published",
      },
      { upsert: true, new: true }
    );

    for (const lesson of section.lessons) {
      const lessonSlug = `${section.slug}-${lesson.slug}`;
      const savedLesson = await LearningLesson.findOneAndUpdate(
        { stableKey: lesson.stableKey },
        {
          sectionId: savedSection._id,
          stableKey: lesson.stableKey,
          name: lesson.name,
          slug: lessonSlug,
          description: lesson.description,
          introContent: lesson.introContent,
          order: lesson.order,
          status: "published",
          icon: lesson.icon,
        },
        { upsert: true, new: true }
      );

      for (let index = 1; index <= lesson.exerciseCount; index += 1) {
        const stableKey = `${lesson.stableKey}.${String(index).padStart(2, "0")}`;
        const authored = authoredExercise(lesson, index);
        const goalConfig = lesson.rulesMode === "QUESTION" ? questionGoal(index) : authored.goalConfig || buildGoalConfig(lesson, index);
        await LearningExercise.findOneAndUpdate(
          { stableKey },
          {
            lessonId: savedLesson._id,
            stableKey,
            title: exerciseTitle(lesson.name, index),
            description: authored.explanation,
            order: index,
            status: "published",
            rulesMode: lesson.rulesMode,
            interactionMode: lesson.interactionMode,
            startingPosition: authored.startingPosition || "start",
            orientation: authored.orientation || "white",
            sideToMove: authored.sideToMove || "white",
            goalType: lesson.goalType,
            goalConfig,
            acceptedSolutions: authored.acceptedMoves?.length ? [{ moves: authored.acceptedMoves }] : [],
            opponentScript: [],
            targets: [],
            obstacles: [],
            hints: [
              {
                text:
                  lesson.rulesMode === "QUESTION"
                    ? `Think about the main idea from ${lesson.name.toLowerCase()}.`
                    : authored.hint,
                showAfterErrors: 1,
              },
            ],
            idealMoves: lesson.rulesMode === "QUESTION" ? 1 : Math.min(3, index + 1),
            maxMoves: lesson.rulesMode === "QUESTION" ? 1 : Math.min(6, index + 3),
            explanation: authored.explanation,
            successMessage: `Nice work on ${lesson.name.toLowerCase()} exercise ${index}.`,
            failureMessage: `Review the ${lesson.name.toLowerCase()} rule and try again.`,
            difficulty: difficultyFor(index, lesson.exerciseCount),
            version: LEARNING_CONTENT_VERSION,
            createdBy: "system.curriculum",
          },
          { upsert: true }
        );
      }
    }
  }
}
