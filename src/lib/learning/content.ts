import { LearningExercise, LearningLesson, LearningSection } from "@/models/Learning";

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
      { stableKey: "pieces.rook", name: "Rook", slug: "rook", description: "Master horizontal and vertical movement.", introContent: "Use the rook to travel in straight lines and collect targets.", order: 2, icon: "rook", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "COLLECT_TARGETS", goalType: "COLLECT_TARGETS" },
      { stableKey: "pieces.bishop", name: "Bishop", slug: "bishop", description: "Practice diagonal movement and blocked paths.", introContent: "See how bishops glide diagonally across the board.", order: 3, icon: "bishop", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "COLLECT_TARGETS", goalType: "COLLECT_TARGETS" },
      { stableKey: "pieces.queen", name: "Queen", slug: "queen", description: "Combine rook and bishop movement into one powerful piece.", introContent: "Use the queen's full range with control and precision.", order: 4, icon: "queen", exerciseCount: 7, rulesMode: "MOVEMENT_TRAINER", interactionMode: "COLLECT_TARGETS", goalType: "COLLECT_TARGETS" },
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
      { stableKey: "basic.defend", name: "Defend", slug: "defend", description: "Identify the squares and pieces that need protection.", introContent: "Strong players notice both threats and defenders.", order: 2, icon: "shield", exerciseCount: 6, rulesMode: "LEGAL_CHESS", interactionMode: "SELECT_SQUARE", goalType: "SELECT_CORRECT_SQUARE" },
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
  const sectionCount = await LearningSection.countDocuments({});
  if (sectionCount > 0) return;

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
        await LearningExercise.findOneAndUpdate(
          { stableKey },
          {
            lessonId: savedLesson._id,
            stableKey,
            title: exerciseTitle(lesson.name, index),
            description: `${lesson.description} Challenge ${index} of ${lesson.exerciseCount}.`,
            order: index,
            status: "published",
            rulesMode: lesson.rulesMode,
            interactionMode: lesson.interactionMode,
            orientation: "white",
            sideToMove: "white",
            goalType: lesson.goalType,
            goalConfig: buildGoalConfig(lesson, index),
            acceptedSolutions: [],
            opponentScript: [],
            targets: [],
            obstacles: [],
            hints: [
              {
                text:
                  lesson.rulesMode === "QUESTION"
                    ? `Think about the main idea from ${lesson.name.toLowerCase()}.`
                    : `Look for the clearest move that matches the ${lesson.name.toLowerCase()} lesson goal.`,
                showAfterErrors: 1,
              },
            ],
            idealMoves: lesson.rulesMode === "QUESTION" ? 1 : Math.min(3, index + 1),
            maxMoves: lesson.rulesMode === "QUESTION" ? 1 : Math.min(6, index + 3),
            explanation: `Seeded curriculum placeholder for ${lesson.name} exercise ${index}.`,
            successMessage: `Nice work on ${lesson.name.toLowerCase()} exercise ${index}.`,
            failureMessage: `Review the ${lesson.name.toLowerCase()} rule and try again.`,
            difficulty: difficultyFor(index, lesson.exerciseCount),
            version: 1,
            createdBy: "system.seed",
          },
          { upsert: true }
        );
      }
    }
  }
}
