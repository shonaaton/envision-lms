import { LearningExercise, LearningLesson, LearningSection } from "@/models/Learning";
import type { LearningInteractionMode, LearningRulesMode, LearningScriptStep } from "@/lib/learning/engine";

/**
 * Authored Learn Chess curriculum.
 *
 * Every exercise below is written out by hand: one position, one idea. Nothing is
 * generated or repeated to pad a lesson out, and `npm test` replays each model
 * solution through the rules engine so a broken FEN cannot reach a student.
 *
 * Bump LEARNING_CONTENT_VERSION whenever positions change - the seeder re-runs on
 * the new version and archives exercises that a lesson no longer lists.
 */
const LEARNING_CONTENT_VERSION = 4;

export type AuthoredExercise = {
  title: string;
  /** The task, in the student's language. Shown beside the board. */
  description: string;
  startingPosition: string;
  orientation?: "white" | "black";
  sideToMove?: "white" | "black";
  interactionMode?: LearningInteractionMode;
  goalType?: string;
  goalConfig?: Record<string, unknown>;
  /** Model line in UCI. Used as the answer key, the admin reference, and by the tests. */
  solution?: string[];
  opponentScript?: LearningScriptStep[];
  targets?: string[];
  obstacles?: string[];
  maxMoves?: number;
  hint: string;
  explanation: string;
  difficulty?: 1 | 2 | 3;
};

export type AuthoredLesson = {
  stableKey: string;
  name: string;
  slug: string;
  description: string;
  introContent: string;
  order: number;
  icon: string;
  rulesMode: LearningRulesMode;
  interactionMode: LearningInteractionMode;
  goalType: string;
  exercises: AuthoredExercise[];
};

export type AuthoredSection = {
  stableKey: string;
  name: string;
  slug: string;
  description: string;
  order: number;
  lessons: AuthoredLesson[];
};

/* ================================================================== *
 * Section 1 - Pieces (movement trainer: geometry only, no check rules)
 * ================================================================== */

const pawnLesson: AuthoredLesson = {
  stableKey: "pieces.pawn",
  name: "Pawn",
  slug: "pawn",
  description: "Start with the pawn's forward movement and captures.",
  introContent: "Pawns only ever walk forwards, but they capture on the diagonal. Get that difference into your fingers first.",
  order: 1,
  icon: "pawn",
  rulesMode: "MOVEMENT_TRAINER",
  interactionMode: "BOARD_MOVE",
  goalType: "REACH_SQUARE",
  exercises: [
    {
      title: "One step forward",
      description: "Move the pawn one square up the board to e3.",
      startingPosition: "8/8/8/8/8/8/4P3/8 w - - 0 1",
      goalConfig: { targetSquare: "e3" },
      solution: ["e2e3"],
      hint: "A pawn always moves straight up its own file.",
      explanation: "The pawn's normal move is one square forward onto an empty square.",
      difficulty: 1,
    },
    {
      title: "The opening double step",
      description: "From its starting square the pawn may jump two squares. Play it to e4.",
      startingPosition: "8/8/8/8/8/8/4P3/8 w - - 0 1",
      goalConfig: { targetSquare: "e4" },
      solution: ["e2e4"],
      hint: "This is only allowed on the pawn's very first move.",
      explanation: "A pawn that has not moved yet may advance two squares, as long as both squares are empty.",
      difficulty: 1,
    },
    {
      title: "Capture on the diagonal",
      description: "Take the black pawn on e5.",
      startingPosition: "8/8/8/4p3/3P4/8/8/8 w - - 0 1",
      goalConfig: { targetSquare: "e5" },
      solution: ["d4e5"],
      hint: "Pawns never capture straight ahead.",
      explanation: "Pawns move forward but capture one square diagonally forward.",
      difficulty: 1,
    },
    {
      title: "Blocked in front",
      description: "The knight on b3 blocks the pawn. Capture the pawn on c3 instead.",
      startingPosition: "8/8/8/8/8/1np5/1P6/8 w - - 0 1",
      goalConfig: { targetSquare: "c3" },
      solution: ["b2c3"],
      hint: "A pawn cannot move forward onto an occupied square, but it can still capture sideways-forward.",
      explanation: "A piece directly in front of a pawn stops it completely. Only a diagonal capture gets it moving again.",
      difficulty: 2,
    },
    {
      title: "Two single steps",
      description: "Walk the pawn onto c3 and then c4. Visit both squares.",
      startingPosition: "8/8/8/8/8/8/2P5/8 w - - 0 1",
      interactionMode: "COLLECT_TARGETS",
      goalType: "COLLECT_TARGETS",
      targets: ["c3", "c4"],
      solution: ["c2c3", "c3c4"],
      maxMoves: 3,
      hint: "If you jump two squares at once you will miss c3 entirely.",
      explanation: "The double step skips the square in between. Two single steps visit both squares.",
      difficulty: 2,
    },
    {
      title: "Two captures in a row",
      description: "Capture on e5, then capture again on f6.",
      startingPosition: "8/8/5p2/4p3/3P4/8/8/8 w - - 0 1",
      interactionMode: "BOARD_SEQUENCE",
      goalConfig: { targetSquare: "f6" },
      opponentScript: [
        { actor: "student", acceptedMoves: ["d4e5"] },
        { actor: "student", acceptedMoves: ["e5f6"] },
      ],
      solution: ["d4e5", "e5f6"],
      hint: "Each capture moves the pawn one file across.",
      explanation: "Every diagonal capture shifts the pawn onto a new file, which is how pawns change lanes.",
      difficulty: 2,
    },
    {
      title: "Reach the fifth rank",
      description: "Get the pawn to h5 in two moves.",
      startingPosition: "8/8/8/8/8/8/7P/8 w - - 0 1",
      goalConfig: { targetSquare: "h5" },
      solution: ["h2h4", "h4h5"],
      maxMoves: 2,
      hint: "Use the double step first, then a single step.",
      explanation: "Double step plus single step is the fastest a pawn can travel three squares.",
      difficulty: 3,
    },
  ],
};

const rookLesson: AuthoredLesson = {
  stableKey: "pieces.rook",
  name: "Rook",
  slug: "rook",
  description: "Master horizontal and vertical movement.",
  introContent: "Rooks are straight-line pieces. They are at their best on open files and ranks.",
  order: 2,
  icon: "rook",
  rulesMode: "MOVEMENT_TRAINER",
  interactionMode: "BOARD_MOVE",
  goalType: "REACH_SQUARE",
  exercises: [
    {
      title: "Up the file",
      description: "Send the rook from a1 to a8.",
      startingPosition: "8/8/8/8/8/8/8/R7 w - - 0 1",
      goalConfig: { targetSquare: "a8" },
      solution: ["a1a8"],
      hint: "The whole a-file is empty.",
      explanation: "A rook may travel any number of empty squares along a file.",
      difficulty: 1,
    },
    {
      title: "Across the rank",
      description: "Send the rook from a1 to h1.",
      startingPosition: "8/8/8/8/8/8/8/R7 w - - 0 1",
      goalConfig: { targetSquare: "h1" },
      solution: ["a1h1"],
      hint: "Rooks move sideways just as freely as they move up and down.",
      explanation: "Ranks and files are the same thing to a rook: straight lines.",
      difficulty: 1,
    },
    {
      title: "Stop before the blocker",
      description: "A black pawn sits on a5. Move the rook to a4.",
      startingPosition: "8/8/8/p7/8/8/8/R7 w - - 0 1",
      goalConfig: { targetSquare: "a4" },
      solution: ["a1a4"],
      hint: "The rook cannot jump the pawn, so a4 is as far as it goes on this file.",
      explanation: "Rooks cannot jump. Anything in the way ends the journey on that line.",
      difficulty: 2,
    },
    {
      title: "Corner to corner in two",
      description: "Get the rook from b2 to g7 using two moves.",
      startingPosition: "8/8/8/8/8/8/1R6/8 w - - 0 1",
      goalConfig: { targetSquare: "g7" },
      solution: ["b2b7", "b7g7"],
      maxMoves: 2,
      hint: "Travel along one line, then turn and travel along the other.",
      explanation: "Any square on an open board is at most two rook moves away: one along the file, one along the rank.",
      difficulty: 2,
    },
    {
      title: "Three stops",
      description: "Visit a4, d4 and d1 with the rook.",
      startingPosition: "8/8/8/8/8/8/8/R7 w - - 0 1",
      interactionMode: "COLLECT_TARGETS",
      goalType: "COLLECT_TARGETS",
      targets: ["a4", "d4", "d1"],
      solution: ["a1a4", "a4d4", "d4d1"],
      maxMoves: 4,
      hint: "Plan a route where each stop is a straight line from the last one.",
      explanation: "Chaining straight lines is how rooks manoeuvre. Each turn costs a move, so plan the order.",
      difficulty: 2,
    },
    {
      title: "Take the bishop",
      description: "Capture the bishop on h6.",
      startingPosition: "8/8/7b/8/8/8/8/7R w - - 0 1",
      goalConfig: { targetSquare: "h6" },
      solution: ["h1h6"],
      hint: "The bishop is on the rook's own file.",
      explanation: "A rook captures the same way it moves: it lands on the enemy piece.",
      difficulty: 1,
    },
    {
      title: "Around the wall",
      description: "The a-file is walled off at a4. Reach h8 in two moves.",
      startingPosition: "8/8/8/8/8/8/8/R7 w - - 0 1",
      obstacles: ["a4"],
      goalConfig: { targetSquare: "h8" },
      solution: ["a1h1", "h1h8"],
      maxMoves: 2,
      hint: "If one route is blocked, turn first and climb later.",
      explanation: "When a line is blocked, a rook simply uses the other one. Order matters more than distance.",
      difficulty: 3,
    },
  ],
};

const bishopLesson: AuthoredLesson = {
  stableKey: "pieces.bishop",
  name: "Bishop",
  slug: "bishop",
  description: "Practice diagonal movement and blocked paths.",
  introContent: "A bishop lives on one colour for the whole game. Everything it can ever reach is the same shade as the square it starts on.",
  order: 3,
  icon: "bishop",
  rulesMode: "MOVEMENT_TRAINER",
  interactionMode: "BOARD_MOVE",
  goalType: "REACH_SQUARE",
  exercises: [
    {
      title: "Along the diagonal",
      description: "Move the bishop from c1 to h6.",
      startingPosition: "8/8/8/8/8/8/8/2B5 w - - 0 1",
      goalConfig: { targetSquare: "h6" },
      solution: ["c1h6"],
      hint: "Count one square across for every square up.",
      explanation: "A bishop travels any distance diagonally, as long as the path is clear.",
      difficulty: 1,
    },
    {
      title: "The other diagonal",
      description: "Move the bishop from f1 to a6.",
      startingPosition: "8/8/8/8/8/8/8/5B2 w - - 0 1",
      goalConfig: { targetSquare: "a6" },
      solution: ["f1a6"],
      hint: "This time the bishop travels up and to the left.",
      explanation: "Each bishop sits on two diagonals at once and may use either of them.",
      difficulty: 1,
    },
    {
      title: "Blocked on the long diagonal",
      description: "A pawn on e3 is in the way. Move the bishop to d2 instead.",
      startingPosition: "8/8/8/8/8/4p3/8/2B5 w - - 0 1",
      goalConfig: { targetSquare: "d2" },
      solution: ["c1d2"],
      hint: "d2 is the last free square before the pawn.",
      explanation: "Bishops cannot jump either. A single pawn can shut down an entire diagonal.",
      difficulty: 2,
    },
    {
      title: "Two diagonals, one journey",
      description: "Reach e5 in two moves.",
      startingPosition: "8/8/8/8/8/8/8/2B5 w - - 0 1",
      goalConfig: { targetSquare: "e5" },
      solution: ["c1b2", "b2e5"],
      maxMoves: 2,
      hint: "e5 is not on either diagonal through c1, so you need a stepping stone.",
      explanation: "Switching diagonals is how a bishop crosses its colour complex.",
      difficulty: 3,
    },
    {
      title: "Three light squares",
      description: "Visit d3, a6 and c8 with the bishop.",
      startingPosition: "8/8/8/8/8/8/8/5B2 w - - 0 1",
      interactionMode: "COLLECT_TARGETS",
      goalType: "COLLECT_TARGETS",
      targets: ["d3", "a6", "c8"],
      solution: ["f1d3", "d3a6", "a6c8"],
      maxMoves: 4,
      hint: "All three squares are light, just like f1.",
      explanation: "Every square a bishop can reach shares its colour. That is why a bishop pair covers the whole board.",
      difficulty: 2,
    },
    {
      title: "Take the rook",
      description: "Capture the rook on g5.",
      startingPosition: "8/8/8/6r1/8/8/8/2B5 w - - 0 1",
      goalConfig: { targetSquare: "g5" },
      solution: ["c1g5"],
      hint: "The rook is sitting on the bishop's long diagonal.",
      explanation: "A bishop captures by landing on the enemy piece at the end of a clear diagonal.",
      difficulty: 1,
    },
    {
      title: "Go the long way round",
      description: "e6 is walled off. Reach h3 in three moves.",
      startingPosition: "2B5/8/8/8/8/8/8/8 w - - 0 1",
      obstacles: ["e6"],
      goalConfig: { targetSquare: "h3" },
      solution: ["c8a6", "a6f1", "f1h3"],
      maxMoves: 3,
      hint: "Use the other diagonal first, then come back across the board.",
      explanation: "A blocked diagonal is not a dead end. Bishops reroute through their other diagonal.",
      difficulty: 3,
    },
  ],
};

const queenLesson: AuthoredLesson = {
  stableKey: "pieces.queen",
  name: "Queen",
  slug: "queen",
  description: "Combine rook and bishop movement into one powerful piece.",
  introContent: "The queen is a rook and a bishop in the same piece. Everything you already know applies.",
  order: 4,
  icon: "queen",
  rulesMode: "MOVEMENT_TRAINER",
  interactionMode: "BOARD_MOVE",
  goalType: "REACH_SQUARE",
  exercises: [
    {
      title: "Queen on the diagonal",
      description: "Move the queen from d1 to h5.",
      startingPosition: "8/8/8/8/8/8/8/3Q4 w - - 0 1",
      goalConfig: { targetSquare: "h5" },
      solution: ["d1h5"],
      hint: "This is a bishop move.",
      explanation: "The queen uses every bishop line as well as every rook line.",
      difficulty: 1,
    },
    {
      title: "Queen up the file",
      description: "Move the queen from d1 to d8.",
      startingPosition: "8/8/8/8/8/8/8/3Q4 w - - 0 1",
      goalConfig: { targetSquare: "d8" },
      solution: ["d1d8"],
      hint: "This one is a rook move.",
      explanation: "Files and ranks are queen lines too, which is why she is worth so much.",
      difficulty: 1,
    },
    {
      title: "Queen across the rank",
      description: "Move the queen from d1 to a1.",
      startingPosition: "8/8/8/8/8/8/8/3Q4 w - - 0 1",
      goalConfig: { targetSquare: "a1" },
      solution: ["d1a1"],
      hint: "Slide sideways along the first rank.",
      explanation: "Eight directions, any distance: that is the whole queen rule.",
      difficulty: 1,
    },
    {
      title: "The long diagonal",
      description: "Move the queen from a1 all the way to h8.",
      startingPosition: "8/8/8/8/8/8/8/Q7 w - - 0 1",
      goalConfig: { targetSquare: "h8" },
      solution: ["a1h8"],
      hint: "Seven squares in one straight diagonal line.",
      explanation: "On an empty board a queen can cross the entire board in a single move.",
      difficulty: 1,
    },
    {
      title: "Queen's tour",
      description: "Visit d5, h5 and h1 with the queen.",
      startingPosition: "8/8/8/8/8/8/8/3Q4 w - - 0 1",
      interactionMode: "COLLECT_TARGETS",
      goalType: "COLLECT_TARGETS",
      targets: ["d5", "h5", "h1"],
      solution: ["d1d5", "d5h5", "h5h1"],
      maxMoves: 4,
      hint: "Each leg of the tour is a straight line from the square before it.",
      explanation: "The queen's power is that every stop opens eight new directions.",
      difficulty: 2,
    },
    {
      title: "Blocked by a pawn",
      description: "The rook on d7 is out of reach. Capture the pawn on d4 instead.",
      startingPosition: "8/3r4/8/8/3p4/8/8/3Q4 w - - 0 1",
      goalConfig: { targetSquare: "d4" },
      solution: ["d1d4"],
      hint: "The queen is powerful, but she still cannot jump.",
      explanation: "The first piece on a line stops the queen. The rook behind the pawn is completely safe.",
      difficulty: 2,
    },
    {
      title: "Detour to a8",
      description: "e4 is walled off. Reach a8 in two moves.",
      startingPosition: "8/8/8/8/8/8/8/7Q w - - 0 1",
      obstacles: ["e4"],
      goalConfig: { targetSquare: "a8" },
      solution: ["h1h8", "h8a8"],
      maxMoves: 2,
      hint: "The diagonal is blocked, so use two straight lines instead.",
      explanation: "When the diagonal is shut, the rook half of the queen still gets there in two.",
      difficulty: 3,
    },
  ],
};

const knightLesson: AuthoredLesson = {
  stableKey: "pieces.knight",
  name: "Knight",
  slug: "knight",
  description: "Learn L-shaped movement and jumping over pieces.",
  introContent: "The knight is the only piece that jumps. Nothing between the start and the finish matters.",
  order: 5,
  icon: "knight",
  rulesMode: "MOVEMENT_TRAINER",
  interactionMode: "BOARD_MOVE",
  goalType: "REACH_SQUARE",
  exercises: [
    {
      title: "The first L",
      description: "Move the knight from b1 to c3.",
      startingPosition: "8/8/8/8/8/8/8/1N6 w - - 0 1",
      goalConfig: { targetSquare: "c3" },
      solution: ["b1c3"],
      hint: "Two squares up, one square across.",
      explanation: "Every knight move is two squares in one direction and one square at right angles to it.",
      difficulty: 1,
    },
    {
      title: "The other opening knight",
      description: "Move the knight from g1 to f3.",
      startingPosition: "8/8/8/8/8/8/8/6N1 w - - 0 1",
      goalConfig: { targetSquare: "f3" },
      solution: ["g1f3"],
      hint: "Same shape, mirrored.",
      explanation: "Nf3 and Nc3 are the two most common opening knight moves in chess for exactly this reason.",
      difficulty: 1,
    },
    {
      title: "Knight in the corner",
      description: "Move the knight from a1 to b3.",
      startingPosition: "8/8/8/8/8/8/8/N7 w - - 0 1",
      goalConfig: { targetSquare: "b3" },
      solution: ["a1b3"],
      hint: "From the corner a knight has only two squares to choose from.",
      explanation: "A knight on the rim has very few options. That is why knights belong in the centre.",
      difficulty: 2,
    },
    {
      title: "Jump the crowd",
      description: "The knight on d4 is surrounded. Jump out to e6.",
      startingPosition: "8/8/8/2ppp3/2pNp3/2ppp3/8/8 w - - 0 1",
      goalConfig: { targetSquare: "e6" },
      solution: ["d4e6"],
      hint: "Only the landing square matters to a knight.",
      explanation: "Knights ignore everything in between. A wall of pawns does not trap them.",
      difficulty: 2,
    },
    {
      title: "Three hops",
      description: "Visit c3, d5 and e3 with the knight.",
      startingPosition: "8/8/8/8/8/8/8/1N6 w - - 0 1",
      interactionMode: "COLLECT_TARGETS",
      goalType: "COLLECT_TARGETS",
      targets: ["c3", "d5", "e3"],
      solution: ["b1c3", "c3d5", "d5e3"],
      maxMoves: 4,
      hint: "Each stop has to be a single L from the one before.",
      explanation: "Knights cover ground in short hops. Planning the order is most of the skill.",
      difficulty: 2,
    },
    {
      title: "Two hops to the centre",
      description: "Get the knight from g1 to d4 in two moves.",
      startingPosition: "8/8/8/8/8/8/8/6N1 w - - 0 1",
      goalConfig: { targetSquare: "d4" },
      solution: ["g1f3", "f3d4"],
      maxMoves: 2,
      hint: "Develop towards the centre first.",
      explanation: "A knight needs two moves to travel this far, and the route through f3 is the natural one.",
      difficulty: 3,
    },
    {
      title: "Fork practice",
      description: "Capture the queen on f5.",
      startingPosition: "8/8/8/5q2/3N4/8/8/8 w - - 0 1",
      goalConfig: { targetSquare: "f5" },
      solution: ["d4f5"],
      hint: "Look for the L that lands on the queen.",
      explanation: "Knights capture where they land, which makes their attacks very hard to see coming.",
      difficulty: 1,
    },
  ],
};

const kingLesson: AuthoredLesson = {
  stableKey: "pieces.king",
  name: "King",
  slug: "king",
  description: "Control one square at a time in every direction.",
  introContent: "The king moves in all eight directions, but only ever one square. Slow, and far more useful than beginners expect.",
  order: 6,
  icon: "king",
  rulesMode: "MOVEMENT_TRAINER",
  interactionMode: "BOARD_MOVE",
  goalType: "REACH_SQUARE",
  exercises: [
    {
      title: "One square forward",
      description: "Move the king from e1 to e2.",
      startingPosition: "8/8/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { targetSquare: "e2" },
      solution: ["e1e2"],
      hint: "Straight up, one square.",
      explanation: "The king's move is always exactly one square.",
      difficulty: 1,
    },
    {
      title: "One square diagonally",
      description: "Move the king from e1 to f2.",
      startingPosition: "8/8/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { targetSquare: "f2" },
      solution: ["e1f2"],
      hint: "Diagonal steps count too.",
      explanation: "All eight neighbouring squares are legal king moves.",
      difficulty: 1,
    },
    {
      title: "One square sideways",
      description: "Move the king from e1 to d1.",
      startingPosition: "8/8/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { targetSquare: "d1" },
      solution: ["e1d1"],
      hint: "Sideways along the first rank.",
      explanation: "Forwards, backwards, sideways, diagonally: always one square.",
      difficulty: 1,
    },
    {
      title: "March to e4",
      description: "Walk the king from e1 up to e4.",
      startingPosition: "8/8/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { targetSquare: "e4" },
      solution: ["e1e2", "e2e3", "e3e4"],
      maxMoves: 3,
      hint: "Three squares means three moves.",
      explanation: "The king is the slowest piece on the board, which matters enormously in endgames.",
      difficulty: 2,
    },
    {
      title: "Three neighbours",
      description: "Visit c5, d5 and e5 with the king.",
      startingPosition: "8/8/8/8/3K4/8/8/8 w - - 0 1",
      interactionMode: "COLLECT_TARGETS",
      goalType: "COLLECT_TARGETS",
      targets: ["c5", "d5", "e5"],
      solution: ["d4c5", "c5d5", "d5e5"],
      maxMoves: 4,
      hint: "Each square must be next to the one before it.",
      explanation: "A king in the centre touches eight squares. On the edge it touches only five.",
      difficulty: 2,
    },
    {
      title: "Around the blockade",
      description: "a2 and a3 are walled off. Reach a4 in three moves.",
      startingPosition: "8/8/8/8/8/8/8/K7 w - - 0 1",
      obstacles: ["a2", "a3"],
      goalConfig: { targetSquare: "a4" },
      solution: ["a1b2", "b2b3", "b3a4"],
      maxMoves: 3,
      hint: "Step onto the b-file, climb, then come back.",
      explanation: "Kings walk around obstacles diagonally, which costs no extra time.",
      difficulty: 3,
    },
    {
      title: "The king captures",
      description: "Take the pawn on d2.",
      startingPosition: "8/8/8/8/8/8/3p4/4K3 w - - 0 1",
      goalConfig: { targetSquare: "d2" },
      solution: ["e1d2"],
      hint: "The pawn is on a neighbouring square.",
      explanation: "The king captures like any other piece, as long as the square is next door and safe.",
      difficulty: 1,
    },
  ],
};

/* ================================================================== *
 * Section 2 - Basic Skills
 * ================================================================== */

const captureLesson: AuthoredLesson = {
  stableKey: "basic.capture",
  name: "Capture",
  slug: "capture",
  description: "Spot free pieces and play the right capture.",
  introContent: "Before anything clever, look for what is simply hanging. Most beginner games are decided by free pieces.",
  order: 1,
  icon: "swords",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "BOARD_MOVE",
  goalType: "CAPTURE_TARGET",
  exercises: [
    {
      title: "Pawn takes pawn",
      description: "Capture the pawn on d5.",
      startingPosition: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1",
      goalConfig: { targetSquare: "d5" },
      solution: ["e4d5"],
      hint: "Your pawn captures diagonally.",
      explanation: "The simplest capture in chess: a pawn takes what stands diagonally in front of it.",
      difficulty: 1,
    },
    {
      title: "Rook takes knight",
      description: "Capture the knight on a7.",
      startingPosition: "4k3/n7/8/8/8/8/8/R3K3 w - - 0 1",
      goalConfig: { targetSquare: "a7" },
      solution: ["a1a7"],
      hint: "The a-file is completely open.",
      explanation: "An open file turns a rook into a long-range weapon.",
      difficulty: 1,
    },
    {
      title: "Bishop takes rook",
      description: "Capture the rook on f4.",
      startingPosition: "4k3/8/8/8/5r2/8/8/2B1K3 w - - 0 1",
      goalConfig: { targetSquare: "f4" },
      solution: ["c1f4"],
      hint: "Follow the diagonal out of the corner.",
      explanation: "Winning a rook for a bishop is a gain of about two pawns. Always worth taking.",
      difficulty: 2,
    },
    {
      title: "Knight takes queen",
      description: "Capture the queen on c4.",
      startingPosition: "4k3/8/8/8/2q5/8/3N4/4K3 w - - 0 1",
      goalConfig: { targetSquare: "c4" },
      solution: ["d2c4"],
      hint: "Find the L-shape that lands on c4.",
      explanation: "Knight moves are easy to overlook, which is why queens get captured by them so often.",
      difficulty: 2,
    },
    {
      title: "Queen takes rook",
      description: "Capture the rook on g4.",
      startingPosition: "4k3/8/8/8/6r1/8/8/3QK3 w - - 0 1",
      goalConfig: { targetSquare: "g4" },
      solution: ["d1g4"],
      hint: "The rook sits on a diagonal from d1.",
      explanation: "The queen's diagonals reach places her straight lines cannot. Check both.",
      difficulty: 2,
    },
    {
      title: "Pawn takes bishop",
      description: "Capture the bishop on a3.",
      startingPosition: "4k3/8/8/8/8/b7/1P6/4K3 w - - 0 1",
      goalConfig: { targetSquare: "a3" },
      solution: ["b2a3"],
      hint: "Even a pawn can win a piece.",
      explanation: "A pawn taking a bishop wins about two pawns of material for nothing.",
      difficulty: 1,
    },
  ],
};

const defendLesson: AuthoredLesson = {
  stableKey: "basic.defend",
  name: "Defend",
  slug: "defend",
  description: "Identify the squares and pieces that need protection.",
  introContent: "Strong players see threats and defenders at the same time. These puzzles are about looking, not moving.",
  order: 2,
  icon: "shield",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "SELECT_SQUARE",
  goalType: "SELECT_CORRECT_SQUARE",
  exercises: [
    {
      title: "Which piece is loose?",
      description: "One white piece has no defender at all. Click it.",
      startingPosition: "4k3/8/8/R7/8/8/4N3/4K3 w - - 0 1",
      goalConfig: { correctSquares: ["a5"], prompt: "Click the white piece that nothing is defending." },
      hint: "The king is standing right next to one of them.",
      explanation: "The knight on e2 is defended by the king. The rook on a5 is on its own.",
      difficulty: 1,
    },
    {
      title: "The king as a defender",
      description: "Click the white piece that the king is defending.",
      startingPosition: "4k3/8/8/7R/8/8/3P4/3K4 w - - 0 1",
      goalConfig: { correctSquares: ["d2"], prompt: "Which piece is the king protecting?" },
      hint: "A king defends every square it touches.",
      explanation: "The king is a real defender. Keeping it near your pawns is a normal endgame plan.",
      difficulty: 1,
    },
    {
      title: "Two loose pieces",
      description: "Two white pieces are undefended. Click both of them.",
      startingPosition: "4k3/8/8/7R/1B6/8/8/4K3 w - - 0 1",
      goalConfig: { correctSquares: ["b4", "h5"], prompt: "Click both undefended white pieces." },
      hint: "Neither of them is near the king or near each other.",
      explanation: "Two loose pieces on the same board invite forks and double attacks.",
      difficulty: 2,
    },
    {
      title: "Whose piece is hanging?",
      description: "One black piece has no defender. Click it.",
      startingPosition: "4k3/8/8/3p4/2n4b/8/8/4K3 w - - 0 1",
      goalConfig: { correctSquares: ["h4"], prompt: "Click the black piece that has no defender." },
      hint: "Remember that black pawns capture downwards.",
      explanation: "The pawn on d5 defends the knight on c4. Nothing looks after the bishop on h4.",
      difficulty: 2,
    },
    {
      title: "What does the knight attack?",
      description: "Click both squares that the black knight on a1 attacks.",
      startingPosition: "4k3/8/8/8/8/8/8/n3K3 w - - 0 1",
      goalConfig: { correctSquares: ["b3", "c2"], prompt: "Click both squares the knight on a1 attacks." },
      hint: "A knight in the corner has the fewest squares of all.",
      explanation: "From a1 a knight reaches only b3 and c2. Corner knights are nearly harmless.",
      difficulty: 2,
    },
    {
      title: "Find the defender",
      description: "Click the white piece that is defending the pawn on d2.",
      startingPosition: "4k3/8/8/8/R7/8/3P4/4K3 w - - 0 1",
      goalConfig: { correctSquares: ["e1"], prompt: "Which piece defends the pawn on d2?" },
      hint: "Look at what is standing next to the pawn.",
      explanation: "The rook on a4 is nowhere near. The king on e1 is the only defender.",
      difficulty: 1,
    },
  ],
};

const valuesLesson: AuthoredLesson = {
  stableKey: "basic.piece-values",
  name: "Piece Values",
  slug: "piece-values",
  description: "Estimate trades using simple material values.",
  introContent: "Pawn 1, knight and bishop 3, rook 5, queen 9. These numbers decide most exchanges.",
  order: 3,
  icon: "coins",
  rulesMode: "QUESTION",
  interactionMode: "MULTIPLE_CHOICE",
  goalType: "MULTIPLE_CHOICE",
  exercises: [
    {
      title: "What is a rook worth?",
      description: "Material values are measured in pawns.",
      startingPosition: "8/8/8/8/8/8/8/8 w - - 0 1",
      goalConfig: {
        prompt: "How many pawns is a rook worth?",
        options: ["5 pawns", "3 pawns", "9 pawns", "1 pawn"],
        correctOption: "5 pawns",
      },
      hint: "It sits between the minor pieces and the queen.",
      explanation: "A rook is worth about five pawns, which is why winning one usually decides the game.",
      difficulty: 1,
    },
    {
      title: "The most valuable piece",
      description: "Which piece is worth about nine pawns?",
      startingPosition: "8/8/8/8/8/8/8/8 w - - 0 1",
      goalConfig: {
        prompt: "Which piece is worth about nine pawns?",
        options: ["Queen", "Rook", "Bishop", "Knight"],
        correctOption: "Queen",
      },
      hint: "It combines two other pieces.",
      explanation: "The queen is worth roughly nine pawns, about as much as two rooks minus a little.",
      difficulty: 1,
    },
    {
      title: "Minor pieces",
      description: "Bishops and knights are grouped together for a reason.",
      startingPosition: "8/8/8/8/8/8/8/8 w - - 0 1",
      goalConfig: {
        prompt: "A bishop and a knight are each worth about how many pawns?",
        options: ["3 pawns", "5 pawns", "2 pawns", "4 pawns"],
        correctOption: "3 pawns",
      },
      hint: "They are called the minor pieces.",
      explanation: "Both are worth about three pawns, so trading one for the other is roughly even.",
      difficulty: 1,
    },
    {
      title: "Is it a good trade?",
      description: "You can win a rook but you will lose a bishop doing it.",
      startingPosition: "8/8/8/8/8/8/8/8 w - - 0 1",
      goalConfig: {
        prompt: "You win a rook and lose a bishop. What happened?",
        options: ["You gained about two pawns of material", "You lost material", "It was exactly equal", "Only good in the endgame"],
        correctOption: "You gained about two pawns of material",
      },
      hint: "Five minus three.",
      explanation: "Rook for bishop is called winning the exchange. It is worth about two pawns.",
      difficulty: 2,
    },
    {
      title: "Two rooks or one queen?",
      description: "Add the values up before you decide.",
      startingPosition: "8/8/8/8/8/8/8/8 w - - 0 1",
      goalConfig: {
        prompt: "Which is worth more: two rooks or one queen?",
        options: ["Two rooks", "One queen", "They are exactly equal", "Neither has a value"],
        correctOption: "Two rooks",
      },
      hint: "Two fives against one nine.",
      explanation: "Two rooks total ten against the queen's nine, and they defend each other well.",
      difficulty: 2,
    },
    {
      title: "What is the king worth?",
      description: "The king is not counted the same way as the other pieces.",
      startingPosition: "8/8/8/8/8/8/8/8 w - - 0 1",
      goalConfig: {
        prompt: "What is the king's material value?",
        options: ["It has no price - losing it ends the game", "9 pawns", "5 pawns", "0 pawns"],
        correctOption: "It has no price - losing it ends the game",
      },
      hint: "You can never trade it.",
      explanation: "The king is never exchanged, so material value does not apply to it.",
      difficulty: 1,
    },
  ],
};

/* ================================================================== *
 * Section 3 - King Safety
 * ================================================================== */

const checkLesson: AuthoredLesson = {
  stableKey: "king-safety.check",
  name: "Check",
  slug: "check",
  description: "Find moves that attack the king legally.",
  introContent: "A check is simply a move that attacks the enemy king. Any move that does it counts here.",
  order: 1,
  icon: "alert",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "BOARD_MOVE",
  goalType: "GIVE_CHECK",
  exercises: [
    {
      title: "Queen gives check",
      description: "Find a queen move that attacks the black king.",
      startingPosition: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["d1d8"],
      hint: "The d-file and the h5-e8 diagonal both reach the king.",
      explanation: "More than one check works here. Qd8 and Qh5 both attack e8.",
      difficulty: 1,
    },
    {
      title: "Rook gives check",
      description: "Attack the black king with the rook.",
      startingPosition: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a1a8"],
      hint: "Get onto the eighth rank.",
      explanation: "Ra8 attacks along the whole eighth rank, and the king is on it.",
      difficulty: 1,
    },
    {
      title: "Bishop gives check",
      description: "Attack the black king on a6 with the bishop.",
      startingPosition: "8/8/k7/8/8/8/8/4KB2 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["f1b5"],
      hint: "Find the diagonal that ends on a6.",
      explanation: "Both Bb5 and Bc4 sit on the diagonal running into a6.",
      difficulty: 2,
    },
    {
      title: "Knight gives check",
      description: "Attack the black king with the knight.",
      startingPosition: "4k3/8/8/8/4N3/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e4d6"],
      hint: "Which squares does a knight attack e8 from?",
      explanation: "Nd6 and Nf6 both give check. A knight check can never be blocked.",
      difficulty: 2,
    },
    {
      title: "Discovered check",
      description: "Move the bishop and the rook behind it will do the work.",
      startingPosition: "4k3/8/8/8/4B3/8/8/4R1K1 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e4d5"],
      hint: "The rook on e1 is already lined up with the king.",
      explanation: "Any bishop move off the e-file uncovers the rook. That is a discovered check.",
      difficulty: 3,
    },
    {
      title: "Pawn gives check",
      description: "Even a pawn can check a king.",
      startingPosition: "4k3/8/3P4/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["d6d7"],
      hint: "Push it one square and look at the diagonals.",
      explanation: "A pawn on d7 attacks c8 and e8, so pushing it checks the king.",
      difficulty: 2,
    },
    {
      title: "Check in the corner",
      description: "The black king is on h8. Give check with the queen.",
      startingPosition: "7k/8/8/8/8/8/8/Q3K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a1a8"],
      hint: "The eighth rank and the h-file both lead to h8.",
      explanation: "Qa8 and Qh1 both check. A cornered king is easy to attack and hard to mate alone.",
      difficulty: 2,
    },
  ],
};

const escapeCheckLesson: AuthoredLesson = {
  stableKey: "king-safety.escape-check",
  name: "Escape Check",
  slug: "escape-check",
  description: "Get the king out of danger with legal responses.",
  introContent: "There are exactly three answers to a check: move the king, block the line, or capture the checker.",
  order: 2,
  icon: "escape",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "BOARD_MOVE",
  goalType: "ESCAPE_CHECK",
  exercises: [
    {
      title: "Step out of the way",
      description: "The rook on e8 is checking. Move the king to safety.",
      startingPosition: "4r1k1/8/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1d1"],
      hint: "Leave the e-file.",
      explanation: "Any king move off the e-file answers the check. Staying on the file is illegal.",
      difficulty: 1,
    },
    {
      title: "Block the check",
      description: "Interpose your rook to stop the check.",
      startingPosition: "4r1k1/8/8/8/R7/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a4e4"],
      hint: "Your rook can reach the e-file in one move.",
      explanation: "Re4 stands between the checking rook and the king. Blocking is often better than running.",
      difficulty: 2,
    },
    {
      title: "Capture the checker",
      description: "The knight on d3 is giving check. Take it.",
      startingPosition: "4k3/8/8/8/8/3n4/8/3QK3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["d1d3"],
      hint: "Your queen is on the same file as the knight.",
      explanation: "Qxd3 removes the checking piece and wins a knight at the same time.",
      difficulty: 2,
    },
    {
      title: "Off the diagonal",
      description: "The bishop on a5 is checking along the diagonal. Escape.",
      startingPosition: "4k3/8/8/b7/8/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1f1"],
      hint: "d2 is still on the bishop's diagonal.",
      explanation: "The king must leave the a5-e1 diagonal completely, so d2 does not help.",
      difficulty: 2,
    },
    {
      title: "Take the checking pawn",
      description: "A pawn on d2 is checking the king. Deal with it.",
      startingPosition: "4k3/8/8/8/8/8/3p4/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1d2"],
      hint: "The pawn is right next to your king.",
      explanation: "Kxd2 removes the checker. A king may capture whenever the square is safe.",
      difficulty: 1,
    },
    {
      title: "Double check",
      description: "Two pieces are checking at once. Only one kind of answer works.",
      startingPosition: "4r1k1/8/8/b7/8/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1f1"],
      hint: "You cannot block or capture two checkers in one move.",
      explanation: "Against a double check the king must move. f1 is off both the e-file and the diagonal.",
      difficulty: 3,
    },
    {
      title: "Block with the knight",
      description: "The queen on h4 is checking. Find a way to stop it.",
      startingPosition: "4k3/8/8/8/7q/7N/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["h3f2"],
      hint: "Which square sits between h4 and e1?",
      explanation: "Nf2 blocks the diagonal. Moving the king also works, but blocking keeps the knight active.",
      difficulty: 3,
    },
  ],
};

const checkmateLesson: AuthoredLesson = {
  stableKey: "king-safety.checkmate",
  name: "Checkmate",
  slug: "checkmate",
  description: "Recognize finishing patterns and mating nets.",
  introContent: "Checkmate is a check with no answer: no escape square, no block, no capture. These are the patterns worth memorising.",
  order: 3,
  icon: "crown",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "BOARD_MOVE",
  goalType: "CHECKMATE",
  exercises: [
    {
      title: "Queen and king finish",
      description: "Deliver checkmate in one move.",
      startingPosition: "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["g6g7"],
      hint: "Put the queen next to the king while your own king guards her.",
      explanation: "Qg7 is mate because the white king defends the queen and covers every escape square.",
      difficulty: 1,
    },
    {
      title: "Back rank mate",
      description: "The black king is trapped behind its own pawns. Finish the game.",
      startingPosition: "6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["d1d8"],
      hint: "The eighth rank is completely empty.",
      explanation: "Qd8 is mate: the pawns block every escape and the queen covers the whole back rank.",
      difficulty: 1,
    },
    {
      title: "Mate in the corner",
      description: "The black king is on h1. Deliver mate.",
      startingPosition: "8/8/8/8/8/5K2/Q7/7k w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a2g2"],
      hint: "Bring the queen to the square next to the king, protected by your own king.",
      explanation: "Qg2 is mate. The king on f3 defends the queen, and g1 and h2 are both covered.",
      difficulty: 2,
    },
    {
      title: "The rook ladder",
      description: "Two rooks, one cornered king. Finish it.",
      startingPosition: "7k/R7/8/8/8/8/8/1R5K w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["b1b8"],
      hint: "One rook already controls the seventh rank.",
      explanation: "Rb8 is mate. The rook on a7 takes away the seventh rank and the new rook covers the eighth.",
      difficulty: 2,
    },
    {
      title: "Another back rank",
      description: "Use the rook to finish on the back rank.",
      startingPosition: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a1a8"],
      hint: "Nothing defends the eighth rank.",
      explanation: "Ra8 is mate. This is why players give their king an escape square before it matters.",
      difficulty: 2,
    },
    {
      title: "Smothered mate",
      description: "The black king is boxed in by its own pieces. Find the knight move.",
      startingPosition: "6rk/6pp/3N4/8/8/8/8/6K1 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["d6f7"],
      hint: "A knight check can never be blocked.",
      explanation: "Nf7 is smothered mate: the rook and pawns take away every flight square themselves.",
      difficulty: 3,
    },
    {
      title: "Mate in two",
      description: "Bring your king closer first, then finish with the rook.",
      startingPosition: "7k/8/5K2/8/8/8/8/R7 w - - 0 1",
      interactionMode: "BOARD_SEQUENCE",
      opponentScript: [
        { actor: "student", acceptedMoves: ["f6g6"] },
        { actor: "opponent", move: "h8g8" },
        { actor: "student", acceptedMoves: ["a1a8"] },
      ],
      solution: ["f6g6", "a1a8"],
      hint: "Kg6 leaves the black king exactly one legal square.",
      explanation: "Kg6 takes g7 and h7 away, so Kg8 is forced. Ra8 is then mate. This is the basic rook mate.",
      difficulty: 3,
    },
  ],
};

/* ================================================================== *
 * Section 4 - Special Moves
 * ================================================================== */

const castlingLesson: AuthoredLesson = {
  stableKey: "special.castling",
  name: "Castling",
  slug: "castling",
  description: "Learn when castling is legal and why it matters.",
  introContent: "Castling moves two pieces at once. Drag the king two squares towards the rook and the rook jumps over it.",
  order: 1,
  icon: "castle",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "BOARD_MOVE",
  goalType: "CASTLE",
  exercises: [
    {
      title: "Castle kingside",
      description: "Both sides are clear. Castle short.",
      startingPosition: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1g1"],
      hint: "Move the king two squares towards the h1 rook.",
      explanation: "Castling is played as a king move of two squares. The rook lands beside it automatically.",
      difficulty: 1,
    },
    {
      title: "Castle queenside",
      description: "The knight on g1 blocks the short side. Castle the other way.",
      startingPosition: "4k3/8/8/8/8/8/8/R3K1NR w KQ - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1c1"],
      hint: "The king still moves exactly two squares.",
      explanation: "Queenside castling sends the king to c1 and the rook to d1.",
      difficulty: 2,
    },
    {
      title: "Only one side is free",
      description: "The queenside is blocked. Castle where you can.",
      startingPosition: "4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1g1"],
      hint: "Every square between the king and the rook must be empty.",
      explanation: "A single piece in between makes castling on that side illegal.",
      difficulty: 2,
    },
    {
      title: "Do not castle into an attack",
      description: "The rook on f8 watches f1. Castle on the safe side.",
      startingPosition: "4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e1c1"],
      hint: "The king may not pass through an attacked square.",
      explanation: "Short castling would cross f1, which black attacks. Long castling is unaffected.",
      difficulty: 3,
    },
    {
      title: "Clear the way first",
      description: "Move the bishop, then castle after black replies.",
      startingPosition: "4k3/8/8/8/8/8/8/R3KB1R w KQ - 0 1",
      interactionMode: "BOARD_SEQUENCE",
      goalConfig: { acceptAnyGoalMove: true },
      opponentScript: [
        { actor: "student", acceptedMoves: ["f1c4"] },
        { actor: "opponent", move: "e8d8" },
        { actor: "student", acceptedMoves: ["e1g1"] },
      ],
      solution: ["f1c4", "e1g1"],
      hint: "Develop the bishop to c4 and the kingside is free.",
      explanation: "Developing the bishop is the normal way to prepare short castling in a real game.",
      difficulty: 2,
    },
    {
      title: "Black castles",
      description: "It is black's move. Castle kingside.",
      startingPosition: "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1",
      sideToMove: "black",
      orientation: "black",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e8g8"],
      hint: "The rule is identical for both colours.",
      explanation: "Black castles from e8 to g8, and the h8 rook lands on f8.",
      difficulty: 1,
    },
  ],
};

const promotionLesson: AuthoredLesson = {
  stableKey: "special.promotion",
  name: "Promotion",
  slug: "promotion",
  description: "Promote pawns correctly, including underpromotion.",
  introContent: "A pawn that reaches the far rank must become a queen, rook, bishop or knight. It never stays a pawn.",
  order: 2,
  icon: "sparkles",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "BOARD_MOVE",
  goalType: "PROMOTE",
  exercises: [
    {
      title: "Make a queen",
      description: "Push the pawn to the last rank.",
      startingPosition: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a7a8q"],
      hint: "One square is all it takes.",
      explanation: "Reaching the eighth rank turns the pawn into a queen immediately.",
      difficulty: 1,
    },
    {
      title: "Promote with a capture",
      description: "There is a knight on b8. Promote however you like.",
      startingPosition: "1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a7b8q"],
      hint: "A pawn can promote by capturing diagonally as well as by pushing.",
      explanation: "axb8=Q wins a knight and makes a queen in the same move.",
      difficulty: 2,
    },
    {
      title: "Underpromote to a knight",
      description: "Only a knight gives check here. Promote to a knight.",
      startingPosition: "8/1P1k4/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { promotionPiece: "n", acceptAnyGoalMove: true },
      solution: ["b7b8n"],
      hint: "A queen on b8 does nothing. A knight on b8 attacks d7.",
      explanation: "This is why underpromotion exists: sometimes the knight's shape is the only one that works.",
      difficulty: 3,
    },
    {
      title: "Underpromote to a rook",
      description: "Promote the pawn to a rook.",
      startingPosition: "4k3/7P/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { promotionPiece: "r", acceptAnyGoalMove: true },
      solution: ["h7h8r"],
      hint: "Choose the rook instead of the queen when the promotion dialog appears.",
      explanation: "A rook is enough to win many endgames, and it avoids accidental stalemates.",
      difficulty: 2,
    },
    {
      title: "Promote with check",
      description: "Capture on b8 and give check at the same time.",
      startingPosition: "1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["a7b8q"],
      hint: "Taking the rook puts a new queen on the eighth rank.",
      explanation: "axb8=Q wins a rook, makes a queen and checks the king. Three things in one move.",
      difficulty: 2,
    },
    {
      title: "Black promotes",
      description: "It is black's move. Promote the pawn on g2.",
      startingPosition: "4k3/8/8/8/8/8/6p1/4K3 b - - 0 1",
      sideToMove: "black",
      orientation: "black",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["g2g1q"],
      hint: "Black promotes on the first rank.",
      explanation: "Black pawns promote on rank one, which is their eighth rank.",
      difficulty: 1,
    },
    {
      title: "Push, then promote",
      description: "Advance the pawn, wait for black's reply, then promote.",
      startingPosition: "4k3/8/P7/8/8/8/8/4K3 w - - 0 1",
      interactionMode: "BOARD_SEQUENCE",
      goalConfig: { acceptAnyGoalMove: true },
      opponentScript: [
        { actor: "student", acceptedMoves: ["a6a7"] },
        { actor: "opponent", move: "e8d8" },
        { actor: "student", acceptedMoves: ["a7a8q"] },
      ],
      solution: ["a6a7", "a7a8q"],
      hint: "a7 first, and the king cannot stop the pawn in time.",
      explanation: "Counting whether the king can catch a passed pawn is one of the core endgame skills.",
      difficulty: 3,
    },
  ],
};

const enPassantLesson: AuthoredLesson = {
  stableKey: "special.en-passant",
  name: "En Passant",
  slug: "en-passant",
  description: "Recognize and play en passant at the right moment.",
  introContent: "If an enemy pawn uses its double step to run past yours, you may capture it as if it had only moved one square. The chance disappears after one move.",
  order: 3,
  icon: "footprints",
  rulesMode: "LEGAL_CHESS",
  interactionMode: "BOARD_MOVE",
  goalType: "EN_PASSANT",
  exercises: [
    {
      title: "The basic capture",
      description: "Black has just played d7-d5. Capture en passant.",
      startingPosition: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e5d6"],
      hint: "Your pawn lands on d6, not on d5.",
      explanation: "The capturing pawn moves diagonally to the square the enemy pawn skipped over.",
      difficulty: 1,
    },
    {
      title: "From the other side",
      description: "Black has just played f7-f5. Capture en passant.",
      startingPosition: "4k3/8/8/4Pp2/8/8/8/4K3 w - f6 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["e5f6"],
      hint: "The same rule works to the right as well as to the left.",
      explanation: "En passant works on either side, as long as your pawn is on the fifth rank.",
      difficulty: 1,
    },
    {
      title: "Black captures en passant",
      description: "White has just played e2-e4. Capture it.",
      startingPosition: "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1",
      sideToMove: "black",
      orientation: "black",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["d4e3"],
      hint: "Black captures onto e3.",
      explanation: "Black's pawn must be on its own fifth rank, which is rank four from white's side.",
      difficulty: 2,
    },
    {
      title: "Two pawns can take",
      description: "Black has just played d7-d5. Either pawn may capture.",
      startingPosition: "4k3/8/8/2PpP3/8/8/8/4K3 w - d6 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["c5d6"],
      hint: "Both c5 and e5 are next to the black pawn.",
      explanation: "When two pawns can capture en passant, you simply choose the one you prefer.",
      difficulty: 2,
    },
    {
      title: "Black takes on g3",
      description: "White has just played g2-g4. Capture en passant.",
      startingPosition: "4k3/8/8/8/5pP1/8/8/4K3 b - g3 0 1",
      sideToMove: "black",
      orientation: "black",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["f4g3"],
      hint: "The pawn ran past you, so take it as it goes.",
      explanation: "En passant is the only capture in chess where the captured piece is not on the landing square.",
      difficulty: 2,
    },
    {
      title: "The only capture available",
      description: "Black has just played a7-a5. Take it en passant.",
      startingPosition: "4k3/8/8/pP6/8/8/8/4K3 w - a6 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      solution: ["b5a6"],
      hint: "Your pawn on b5 steps up to a6.",
      explanation: "Without en passant a pawn could safely run past an enemy pawn. The rule closes that hole.",
      difficulty: 2,
    },
  ],
};

/* ================================================================== *
 * Lesson intros (INFORMATION slides)
 *
 * Each lesson opens with a teaching screen: a few key points and a worked line
 * the student can step through. They are keyed separately from the numbered
 * exercises so that adding one never renumbers a puzzle a student has already
 * solved.
 * ================================================================== */

const lessonIntros: Record<string, AuthoredExercise> = {
  "pieces.pawn": {
    title: "How pawns move",
    description: "Pawns are the only piece that captures differently from the way it moves. Step through the example before you try it yourself.",
    startingPosition: "8/8/8/3p4/8/8/4P3/8 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "Pawns only ever move forwards. They can never step backwards.",
        "From its starting square a pawn may move one or two squares.",
        "After that first move it advances one square at a time.",
        "Pawns capture one square diagonally forwards, never straight ahead.",
      ],
      demoMoves: ["e2e4", "e4d5"],
    },
    hint: "",
    explanation: "Forwards to move, diagonally to capture. That one difference causes most beginner mistakes.",
  },
  "pieces.rook": {
    title: "How rooks move",
    description: "The rook is a straight-line piece. Watch it travel along a file and then along a rank.",
    startingPosition: "8/8/8/8/8/8/8/R7 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "Rooks move any distance along a rank or a file.",
        "They cannot move diagonally at all.",
        "A rook cannot jump: the first piece in the way stops it.",
        "A rook is worth about five pawns.",
      ],
      demoMoves: ["a1a5", "a5e5"],
    },
    hint: "",
    explanation: "Files and ranks are the same thing to a rook. Open lines are what make it strong.",
  },
  "pieces.bishop": {
    title: "How bishops move",
    description: "A bishop stays on one colour for the whole game. Follow the two diagonals in the example.",
    startingPosition: "8/8/8/8/8/8/8/2B5 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "Bishops move any distance along a diagonal.",
        "A bishop can never change the colour of square it stands on.",
        "Like the rook, a bishop cannot jump over anything.",
        "A bishop is worth about three pawns.",
      ],
      demoMoves: ["c1g5", "g5d8"],
    },
    hint: "",
    explanation: "Because each bishop covers only half the board, the two of them together are worth more than the sum of their parts.",
  },
  "pieces.queen": {
    title: "How the queen moves",
    description: "The queen is a rook and a bishop in one piece. The example uses both halves.",
    startingPosition: "8/8/8/8/8/8/8/3Q4 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "The queen moves any distance in all eight directions.",
        "That is every rook line plus every bishop line.",
        "She still cannot jump over pieces.",
        "The queen is worth about nine pawns, the most of any piece.",
      ],
      demoMoves: ["d1d5", "d5h5", "h5e2"],
    },
    hint: "",
    explanation: "Because she is worth so much, the queen is also the easiest piece to lose. Bring her out carefully.",
  },
  "pieces.knight": {
    title: "How knights move",
    description: "The knight is the odd one out: it jumps. Step through three hops towards the centre.",
    startingPosition: "8/8/8/8/8/8/8/1N6 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "A knight moves two squares one way, then one square at right angles.",
        "It is the only piece that jumps over other pieces.",
        "Only the landing square matters, never the squares in between.",
        "A knight is worth about three pawns, the same as a bishop.",
      ],
      demoMoves: ["b1c3", "c3d5", "d5f6"],
    },
    hint: "",
    explanation: "A knight in the centre reaches eight squares. In the corner it reaches two. That is why knights belong in the middle.",
  },
  "pieces.king": {
    title: "How the king moves",
    description: "The king moves in every direction, but only one square at a time.",
    startingPosition: "8/8/8/8/8/8/8/4K3 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "The king moves exactly one square in any of the eight directions.",
        "It can never move onto a square that is attacked.",
        "The king is never traded, so it has no material value.",
        "In the endgame the king becomes a strong attacking piece.",
      ],
      demoMoves: ["e1e2", "e2d3", "d3d4"],
    },
    hint: "",
    explanation: "Slow, but safe and surprisingly useful. Walking the king towards the centre wins many endgames.",
  },
  "basic.capture": {
    title: "Taking what is free",
    description: "Most beginner games are decided by pieces left hanging. Look for them before anything clever.",
    startingPosition: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "A capture replaces the enemy piece on its square.",
        "Before every move, check what your opponent has left undefended.",
        "Then check the same thing about your own pieces.",
        "Taking a free piece is almost always better than a clever plan.",
      ],
      demoMoves: ["e4d5"],
    },
    hint: "",
    explanation: "Scan for free material every single move. It is the habit that improves beginners fastest.",
  },
  "basic.defend": {
    title: "Defenders and loose pieces",
    description: "A piece with no defender is called loose. Watch the king walk across to protect the pawn.",
    startingPosition: "4k3/8/8/8/8/3P4/8/5K2 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "A piece is defended when one of your own pieces could recapture on its square.",
        "A piece with no defender is loose, and loose pieces invite forks.",
        "The king is a real defender, especially in the endgame.",
        "In the next few puzzles you only click squares. Nothing moves.",
      ],
      demoMoves: ["f1e2", "e8d8", "e2d2"],
    },
    hint: "",
    explanation: "Seeing defenders is the same skill as seeing threats, just from the other side of the board.",
  },
  "basic.piece-values": {
    title: "What the pieces are worth",
    description: "Material values are counted in pawns. These numbers decide almost every exchange.",
    startingPosition: "8/8/8/8/8/8/8/1QRBNP2 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "Pawn 1, knight 3, bishop 3, rook 5, queen 9.",
        "The king has no value: it is never traded.",
        "Winning a rook for a bishop is called winning the exchange.",
        "These are guidelines, not laws. Position matters too.",
      ],
    },
    hint: "",
    explanation: "Learn the five numbers and most trades answer themselves.",
  },
  "king-safety.check": {
    title: "What check means",
    description: "Check is any move that attacks the enemy king. Watch the queen deliver one.",
    startingPosition: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "A king is in check when an enemy piece attacks its square.",
        "Check must be answered immediately. You cannot ignore it.",
        "You may never make a move that leaves your own king in check.",
        "Check is not the same as checkmate. Most checks are easy to answer.",
      ],
      demoMoves: ["d1d8"],
    },
    hint: "",
    explanation: "Giving check is not automatically good. A check that achieves nothing just loses time.",
  },
  "king-safety.escape-check": {
    title: "The three ways out",
    description: "There are exactly three answers to a check. The example shows the second one.",
    startingPosition: "4r1k1/8/8/R7/8/8/8/4K3 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "Move the king to a safe square.",
        "Block the line between the checking piece and the king.",
        "Capture the piece that is giving check.",
        "Against a knight check or a double check, only moving the king works.",
      ],
      demoMoves: ["a5e5"],
    },
    hint: "",
    explanation: "Run through all three answers every time. The obvious king move is often the worst of them.",
  },
  "king-safety.checkmate": {
    title: "What checkmate means",
    description: "Checkmate is a check with no answer at all. Watch a back rank mate.",
    startingPosition: "6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "Checkmate is check where the king cannot move, block or capture.",
        "The game ends immediately. The king is never actually taken.",
        "Most mates need two attackers, or one attacker plus a trapped king.",
        "A king with no escape squares is in danger even before the check arrives.",
      ],
      demoMoves: ["d1d8"],
    },
    hint: "",
    explanation: "The pawns in front of the king protect it and trap it at the same time. That is the back rank problem.",
  },
  "special.castling": {
    title: "Castling, the two-piece move",
    description: "Castling moves the king and a rook together. Watch both sides do it.",
    startingPosition: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    goalConfig: {
      keyPoints: [
        "The king moves two squares towards a rook, and that rook hops over to its other side.",
        "Neither the king nor that rook may have moved before.",
        "Every square between them must be empty.",
        "You may not castle out of check, through check, or into check.",
      ],
      demoMoves: ["e1g1", "e8c8"],
    },
    hint: "",
    explanation: "Castling tucks the king away and brings a rook towards the centre. It is usually worth doing early.",
  },
  "special.promotion": {
    title: "Promotion",
    description: "A pawn that reaches the far side becomes a new piece. Watch one turn into a queen.",
    startingPosition: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
    goalConfig: {
      keyPoints: [
        "A pawn reaching the eighth rank must promote. It cannot stay a pawn.",
        "You may choose a queen, rook, bishop or knight.",
        "You can have more than one queen on the board at a time.",
        "Choosing something other than a queen is called underpromotion.",
      ],
      demoMoves: ["a7a8q"],
    },
    hint: "",
    explanation: "Almost always take the queen. The exceptions, usually a knight for a check, are worth knowing.",
  },
  "special.en-passant": {
    title: "En passant",
    description: "The strangest rule in chess, and the one everyone forgets. Watch it happen.",
    startingPosition: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
    goalConfig: {
      keyPoints: [
        "It only works when an enemy pawn has just used its two-square move.",
        "Your capturing pawn must be sitting beside it, on your fifth rank.",
        "You capture onto the square the enemy pawn skipped over.",
        "The chance vanishes if you do not take it immediately.",
      ],
      demoMoves: ["e5d6"],
    },
    hint: "",
    explanation: "The rule exists so a pawn cannot use its double step to sneak safely past an enemy pawn.",
  },
};

export function introStableKey(lessonStableKey: string) {
  return `${lessonStableKey}.intro`;
}

export function introFor(lesson: AuthoredLesson): AuthoredExercise | undefined {
  const intro = lessonIntros[lesson.stableKey];
  if (!intro) return undefined;
  return {
    ...intro,
    interactionMode: "INFORMATION",
    goalType: "INFORMATION",
    difficulty: 1,
    // Demo lines are replayed with the lesson's own rules, so a movement lesson
    // can show a king-less position and a chess lesson can show en passant.
    sideToMove: intro.sideToMove || "white",
  };
}

export const AUTHORED_SECTIONS: AuthoredSection[] = [
  {
    stableKey: "pieces",
    name: "Pieces",
    slug: "pieces",
    description: "Learn how each chess piece moves, captures, and controls the board.",
    order: 1,
    lessons: [pawnLesson, rookLesson, bishopLesson, queenLesson, knightLesson, kingLesson],
  },
  {
    stableKey: "basic-skills",
    name: "Basic Skills",
    slug: "basic-skills",
    description: "Build board awareness with captures, defenders, and material values.",
    order: 2,
    lessons: [captureLesson, defendLesson, valuesLesson],
  },
  {
    stableKey: "king-safety",
    name: "King Safety",
    slug: "king-safety",
    description: "Learn to recognize check, escape danger, and finish with checkmate.",
    order: 3,
    lessons: [checkLesson, escapeCheckLesson, checkmateLesson],
  },
  {
    stableKey: "special-moves",
    name: "Special Moves",
    slug: "special-moves",
    description: "Practice the special rules that make full chess play possible.",
    order: 4,
    lessons: [castlingLesson, promotionLesson, enPassantLesson],
  },
];

export function learningSeedBlueprint() {
  return AUTHORED_SECTIONS;
}

export function authoredExerciseStableKey(lessonStableKey: string, index: number) {
  return `${lessonStableKey}.${String(index).padStart(2, "0")}`;
}

/** Flat view of the curriculum, used by the content tests and the admin screens. */
export function authoredExerciseList() {
  return AUTHORED_SECTIONS.flatMap((section) =>
    section.lessons.flatMap((lesson) => {
      const intro = introFor(lesson);
      const introEntry = intro
        ? [{ section, lesson, exercise: intro, order: 0, stableKey: introStableKey(lesson.stableKey) }]
        : [];
      return [
        ...introEntry,
        ...lesson.exercises.map((exercise, index) => ({
          section,
          lesson,
          exercise,
          order: index + 1,
          stableKey: authoredExerciseStableKey(lesson.stableKey, index + 1),
        })),
      ];
    })
  );
}

export function exerciseDocument(lesson: AuthoredLesson, exercise: AuthoredExercise, order: number) {
  return {
    stableKey: authoredExerciseStableKey(lesson.stableKey, order),
    title: exercise.title,
    description: exercise.description,
    order,
    status: "published" as const,
    rulesMode: lesson.rulesMode,
    interactionMode: exercise.interactionMode || lesson.interactionMode,
    startingPosition: exercise.startingPosition,
    orientation: exercise.orientation || "white",
    sideToMove: exercise.sideToMove || "white",
    goalType: exercise.goalType || lesson.goalType,
    goalConfig: exercise.goalConfig || {},
    acceptedSolutions: exercise.solution?.length ? [{ moves: exercise.solution }] : [],
    opponentScript: exercise.opponentScript || [],
    targets: exercise.targets || [],
    obstacles: exercise.obstacles || [],
    hints: [{ text: exercise.hint, showAfterErrors: 1 }],
    idealMoves: exercise.solution?.length || 1,
    maxMoves: exercise.maxMoves || 0,
    explanation: exercise.explanation,
    successMessage: `Correct. ${exercise.explanation}`,
    failureMessage: `Not yet. ${exercise.hint}`,
    difficulty: exercise.difficulty || 1,
    version: LEARNING_CONTENT_VERSION,
    createdBy: "system.curriculum",
  };
}

export async function ensureLearningSeedData() {
  const currentVersionExists = await LearningExercise.exists({
    createdBy: "system.curriculum",
    version: LEARNING_CONTENT_VERSION,
  });
  if (currentVersionExists) return;

  for (const section of AUTHORED_SECTIONS) {
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
      const savedLesson = await LearningLesson.findOneAndUpdate(
        { stableKey: lesson.stableKey },
        {
          sectionId: savedSection._id,
          stableKey: lesson.stableKey,
          name: lesson.name,
          slug: `${section.slug}-${lesson.slug}`,
          description: lesson.description,
          introContent: lesson.introContent,
          order: lesson.order,
          status: "published",
          icon: lesson.icon,
        },
        { upsert: true, new: true }
      );

      const stableKeys: string[] = [];

      const intro = introFor(lesson);
      if (intro) {
        const introDoc = {
          ...exerciseDocument(lesson, intro, 0),
          stableKey: introStableKey(lesson.stableKey),
          order: 0,
          // Nothing to get wrong on a slide, so no hint and no failure message.
          hints: [] as Array<{ text: string; showAfterErrors: number }>,
          idealMoves: 0,
          maxMoves: 0,
          successMessage: intro.explanation,
          failureMessage: "",
        };
        stableKeys.push(introDoc.stableKey);
        await LearningExercise.findOneAndUpdate(
          { stableKey: introDoc.stableKey },
          { lessonId: savedLesson._id, ...introDoc },
          { upsert: true }
        );
      }

      for (let index = 0; index < lesson.exercises.length; index += 1) {
        const document = exerciseDocument(lesson, lesson.exercises[index], index + 1);
        stableKeys.push(document.stableKey);
        await LearningExercise.findOneAndUpdate(
          { stableKey: document.stableKey },
          { lessonId: savedLesson._id, ...document },
          { upsert: true }
        );
      }

      // An earlier version may have seeded more exercises than this lesson now lists.
      await LearningExercise.updateMany(
        { lessonId: savedLesson._id, createdBy: "system.curriculum", stableKey: { $nin: stableKeys } },
        { $set: { status: "archived" } }
      );
    }
  }
}
