import { Chess } from "chess.js";

/**
 * Shared rules engine for Learn Chess. Pure and isomorphic on purpose: the board player
 * runs it in the browser for instant feedback, and /api/learn/attempt replays the same
 * moves through it server-side so a completion can never be claimed without solving.
 */

export type LearningRulesMode = "MOVEMENT_TRAINER" | "LEGAL_CHESS" | "QUESTION";

export type LearningInteractionMode =
  | "BOARD_MOVE"
  | "BOARD_SEQUENCE"
  | "COLLECT_TARGETS"
  | "MULTIPLE_CHOICE"
  | "SELECT_SQUARE"
  | "INFORMATION";

export type LearningScriptStep = {
  actor: "student" | "opponent";
  move?: string;
  acceptedMoves?: string[];
};

export type LearningExerciseSpec = {
  rulesMode: LearningRulesMode;
  interactionMode: LearningInteractionMode;
  goalType: string;
  startingPosition: string;
  orientation?: "white" | "black";
  sideToMove?: "white" | "black";
  goalConfig?: Record<string, any>;
  acceptedSolutions?: Array<{ moves: string[] }>;
  opponentScript?: LearningScriptStep[];
  targets?: string[];
  obstacles?: string[];
  idealMoves?: number;
  maxMoves?: number;
};

export type LearningSessionState = {
  fen: string;
  status: "playing" | "solved" | "failed";
  studentMoves: string[];
  collectedTargets: string[];
  selectedSquares: string[];
  step: number;
  moveCount: number;
  incorrectMoves: number;
  lastMove?: { from: string; to: string };
};

export type LearningMoveOutcome = {
  state: LearningSessionState;
  ok: boolean;
  solved: boolean;
  failed: boolean;
  /** Why a move was turned away, so the UI can coach instead of just buzzing. */
  reason?: string;
  /** Reply the script played for the opponent, for move-list display. */
  opponentMove?: { from: string; to: string; san?: string };
};

const FILES = "abcdefgh";
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/* ------------------------------------------------------------------ *
 * Board parsing for MOVEMENT_TRAINER
 *
 * chess.js refuses a FEN without both kings, which is exactly the kind of
 * position a movement lesson wants: one knight, three flags, nothing else.
 * So movement exercises get their own minimal board model with no turn order,
 * no check and no pins, just piece geometry.
 * ------------------------------------------------------------------ */

export type MovementPiece = { type: "p" | "n" | "b" | "r" | "q" | "k"; color: "w" | "b" };
export type MovementBoard = Map<string, MovementPiece>;

export function isSquare(value: unknown): value is string {
  return typeof value === "string" && /^[a-h][1-8]$/.test(value);
}

function coords(square: string) {
  return { file: FILES.indexOf(square[0]), rank: Number(square[1]) - 1 };
}

function toSquare(file: number, rank: number) {
  return `${FILES[file]}${rank + 1}`;
}

export function parseMovementBoard(fen: string): MovementBoard {
  const board: MovementBoard = new Map();
  const placement = String(fen || "").trim().split(/\s+/)[0] || "";
  const rows = placement.split("/");
  if (rows.length !== 8) return board;
  rows.forEach((row, rowIndex) => {
    const rank = 7 - rowIndex;
    let file = 0;
    for (const character of row) {
      if (/\d/.test(character)) {
        file += Number(character);
        continue;
      }
      if (file > 7) break;
      const color = character === character.toUpperCase() ? "w" : "b";
      const type = character.toLowerCase() as MovementPiece["type"];
      board.set(toSquare(file, rank), { type, color });
      file += 1;
    }
  });
  return board;
}

export function serializeMovementBoard(board: MovementBoard, activeColor: "w" | "b" = "w") {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board.get(toSquare(file, rank));
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      row += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return `${rows.join("/")} ${activeColor} - - 0 1`;
}

function pathIsClear(board: MovementBoard, obstacles: Set<string>, from: string, to: string) {
  const start = coords(from);
  const end = coords(to);
  const fileStep = Math.sign(end.file - start.file);
  const rankStep = Math.sign(end.rank - start.rank);
  let file = start.file + fileStep;
  let rank = start.rank + rankStep;
  while (file !== end.file || rank !== end.rank) {
    const square = toSquare(file, rank);
    if (board.has(square) || obstacles.has(square)) return false;
    file += fileStep;
    rank += rankStep;
  }
  return true;
}

/** Geometry only: does this piece move like that? No check, no turn order. */
export function movementMoveIsLegal(board: MovementBoard, obstacles: Set<string>, from: string, to: string) {
  if (!isSquare(from) || !isSquare(to) || from === to) return false;
  const piece = board.get(from);
  if (!piece) return false;
  if (obstacles.has(to)) return false;
  const occupant = board.get(to);
  if (occupant && occupant.color === piece.color) return false;

  const start = coords(from);
  const end = coords(to);
  const fileDelta = end.file - start.file;
  const rankDelta = end.rank - start.rank;
  const absFile = Math.abs(fileDelta);
  const absRank = Math.abs(rankDelta);

  switch (piece.type) {
    case "n":
      return (absFile === 1 && absRank === 2) || (absFile === 2 && absRank === 1);
    case "k":
      return absFile <= 1 && absRank <= 1;
    case "r":
      if (fileDelta !== 0 && rankDelta !== 0) return false;
      return pathIsClear(board, obstacles, from, to);
    case "b":
      if (absFile !== absRank) return false;
      return pathIsClear(board, obstacles, from, to);
    case "q":
      if (fileDelta !== 0 && rankDelta !== 0 && absFile !== absRank) return false;
      return pathIsClear(board, obstacles, from, to);
    case "p": {
      const direction = piece.color === "w" ? 1 : -1;
      const homeRank = piece.color === "w" ? 1 : 6;
      if (fileDelta === 0) {
        if (occupant) return false;
        if (rankDelta === direction) return true;
        if (rankDelta === 2 * direction && start.rank === homeRank) {
          const middle = toSquare(start.file, start.rank + direction);
          return !board.has(middle) && !obstacles.has(middle);
        }
        return false;
      }
      if (absFile === 1 && rankDelta === direction) return Boolean(occupant && occupant.color !== piece.color);
      return false;
    }
    default:
      return false;
  }
}

export function movementDestinations(board: MovementBoard, obstacles: Set<string>, from: string) {
  const destinations: string[] = [];
  for (let file = 0; file < 8; file += 1) {
    for (let rank = 0; rank < 8; rank += 1) {
      const square = toSquare(file, rank);
      if (movementMoveIsLegal(board, obstacles, from, square)) destinations.push(square);
    }
  }
  return destinations;
}

/* ------------------------------------------------------------------ *
 * Move notation helpers
 * ------------------------------------------------------------------ */

export function normalizeMoveToken(value: string) {
  return String(value || "").replace(/[+#?!]/g, "").trim();
}

function uciOf(from: string, to: string, promotion?: string) {
  return `${from}${to}${promotion ? promotion.toLowerCase() : ""}`;
}

function moveMatches(accepted: string[] | undefined, candidates: string[]) {
  if (!accepted || accepted.length === 0) return false;
  const normalizedAccepted = accepted.map(normalizeMoveToken);
  return candidates.some((candidate) => normalizedAccepted.includes(normalizeMoveToken(candidate)));
}

/* ------------------------------------------------------------------ *
 * Session lifecycle
 * ------------------------------------------------------------------ */

export function resolveStartingFen(spec: LearningExerciseSpec) {
  const raw = String(spec.startingPosition || "").trim();
  if (!raw || raw === "start" || raw === "startpos") return STARTING_FEN;
  return raw;
}

export function createSession(spec: LearningExerciseSpec): LearningSessionState {
  return {
    fen: resolveStartingFen(spec),
    status: "playing",
    studentMoves: [],
    collectedTargets: [],
    selectedSquares: [],
    step: 0,
    moveCount: 0,
    incorrectMoves: 0,
  };
}

function scriptSteps(spec: LearningExerciseSpec) {
  return Array.isArray(spec.opponentScript) ? spec.opponentScript : [];
}

function usesScript(spec: LearningExerciseSpec) {
  return spec.interactionMode === "BOARD_SEQUENCE" && scriptSteps(spec).length > 0;
}

function obstacleSet(spec: LearningExerciseSpec) {
  return new Set((spec.obstacles || []).filter(isSquare));
}

function declaredTargets(spec: LearningExerciseSpec) {
  const declared = (spec.targets || []).filter(isSquare);
  if (declared.length) return declared;
  const fromConfig = spec.goalConfig?.targets;
  return Array.isArray(fromConfig) ? fromConfig.filter(isSquare) : [];
}

function targetQuota(spec: LearningExerciseSpec) {
  const all = declaredTargets(spec);
  const configured = Number(spec.goalConfig?.requiredTargets || 0);
  if (configured > 0) return all.length ? Math.min(configured, all.length) : configured;
  return all.length;
}

export function movesAllowed(spec: LearningExerciseSpec) {
  const max = Number(spec.maxMoves || 0);
  return max > 0 ? max : 0;
}

/** Destinations the UI should highlight for the piece the student picked up. */
export function legalDestinations(spec: LearningExerciseSpec, state: LearningSessionState, from: string) {
  if (state.status !== "playing") return [];
  if (spec.rulesMode === "MOVEMENT_TRAINER") {
    return movementDestinations(parseMovementBoard(state.fen), obstacleSet(spec), from);
  }
  if (spec.rulesMode === "LEGAL_CHESS") {
    try {
      const game = new Chess(state.fen);
      return game.moves({ square: from as any, verbose: true }).map((move: any) => String(move.to));
    } catch {
      return [];
    }
  }
  return [];
}

/* ------------------------------------------------------------------ *
 * Goal evaluation
 * ------------------------------------------------------------------ */

type LegalMoveInfo = {
  from: string;
  to: string;
  san: string;
  uci: string;
  flags: string;
  captured?: string;
  promotion?: string;
};

function goalSquare(spec: LearningExerciseSpec) {
  const square = spec.goalConfig?.targetSquare;
  return isSquare(square) ? square : undefined;
}

function movementGoalReached(spec: LearningExerciseSpec, state: LearningSessionState, to: string) {
  switch (spec.goalType) {
    case "COLLECT_TARGETS": {
      const quota = targetQuota(spec);
      return quota > 0 && state.collectedTargets.length >= quota;
    }
    case "REACH_SQUARE":
    default: {
      const target = goalSquare(spec);
      return Boolean(target && to === target);
    }
  }
}

function legalChessGoalReached(spec: LearningExerciseSpec, game: Chess, move: LegalMoveInfo) {
  const target = goalSquare(spec);
  switch (spec.goalType) {
    case "CAPTURE_TARGET":
      if (!move.captured) return false;
      return target ? move.to === target : true;
    case "GIVE_CHECK":
      return game.isCheck();
    case "ESCAPE_CHECK":
      // chess.js only produces legal moves, so any accepted move already leaves check.
      return !game.isCheck();
    case "CHECKMATE":
      return game.isCheckmate();
    case "CASTLE":
      return move.flags.includes("k") || move.flags.includes("q");
    case "PROMOTE": {
      if (!move.flags.includes("p")) return false;
      const wanted = String(spec.goalConfig?.promotionPiece || "").toLowerCase();
      return wanted ? move.promotion === wanted : true;
    }
    case "EN_PASSANT":
      return move.flags.includes("e");
    case "REACH_SQUARE":
      return Boolean(target && move.to === target);
    default:
      return true;
  }
}

function acceptedMoveLists(spec: LearningExerciseSpec) {
  return (spec.acceptedSolutions || []).map((solution) => (Array.isArray(solution.moves) ? solution.moves : []));
}

/** Single-move exercises: the authored list is the answer key when one is present. */
function singleMoveAccepted(spec: LearningExerciseSpec, candidates: string[]) {
  const lists = acceptedMoveLists(spec).filter((moves) => moves.length > 0);
  if (!lists.length) return undefined;
  return lists.some((moves) => moveMatches([moves[0]], candidates));
}

/* ------------------------------------------------------------------ *
 * Applying a board move
 * ------------------------------------------------------------------ */

function rejected(state: LearningSessionState, reason: string): LearningMoveOutcome {
  return {
    state: { ...state, incorrectMoves: state.incorrectMoves + 1 },
    ok: false,
    solved: false,
    failed: false,
    reason,
  };
}

export function applyMove(
  spec: LearningExerciseSpec,
  state: LearningSessionState,
  from: string,
  to: string,
  promotion?: string
): LearningMoveOutcome {
  if (state.status !== "playing") {
    return {
      state,
      ok: false,
      solved: state.status === "solved",
      failed: state.status === "failed",
      reason: "This exercise is already finished.",
    };
  }
  if (spec.rulesMode === "QUESTION") return rejected(state, "Answer the question to continue.");
  if (spec.rulesMode === "MOVEMENT_TRAINER") return applyMovementMove(spec, state, from, to);
  return applyLegalChessMove(spec, state, from, to, promotion);
}

function applyMovementMove(
  spec: LearningExerciseSpec,
  state: LearningSessionState,
  from: string,
  to: string
): LearningMoveOutcome {
  const board = parseMovementBoard(state.fen);
  const obstacles = obstacleSet(spec);
  const piece = board.get(from);
  if (!piece) return rejected(state, "Pick one of your own pieces first.");

  const side = spec.sideToMove === "black" ? "b" : "w";
  if (piece.color !== side) return rejected(state, "Move your own piece for this exercise.");

  if (!movementMoveIsLegal(board, obstacles, from, to)) {
    return rejected(state, movementRejectionReason(piece.type, board, obstacles, from, to));
  }

  const scripted = usesScript(spec);
  let step = state.step;
  if (scripted) {
    const current = scriptSteps(spec)[step];
    if (!current || current.actor !== "student") return rejected(state, "Wait for the reply before moving again.");
    if (!moveMatches(current.acceptedMoves, [uciOf(from, to)])) {
      return rejected(state, "That is not the next move in this sequence.");
    }
    step += 1;
  }

  const nextBoard = new Map(board);
  nextBoard.delete(from);
  nextBoard.set(to, piece);
  const fen = serializeMovementBoard(nextBoard, side);

  const targets = declaredTargets(spec);
  const collectedTargets =
    targets.includes(to) && !state.collectedTargets.includes(to)
      ? [...state.collectedTargets, to]
      : state.collectedTargets;

  const nextState: LearningSessionState = {
    ...state,
    fen,
    studentMoves: [...state.studentMoves, uciOf(from, to)],
    collectedTargets,
    moveCount: state.moveCount + 1,
    step,
    lastMove: { from, to },
  };

  const scriptComplete = scripted ? step >= scriptSteps(spec).length : true;
  if (scriptComplete && movementGoalReached(spec, nextState, to)) {
    return { state: { ...nextState, status: "solved" }, ok: true, solved: true, failed: false };
  }

  const limit = movesAllowed(spec);
  if (limit && nextState.moveCount >= limit) {
    return {
      state: { ...nextState, status: "failed" },
      ok: true,
      solved: false,
      failed: true,
      reason: `That used all ${limit} moves. Reset and look for a shorter route.`,
    };
  }

  return { state: nextState, ok: true, solved: false, failed: false };
}

function movementRejectionReason(
  type: MovementPiece["type"],
  board: MovementBoard,
  obstacles: Set<string>,
  from: string,
  to: string
) {
  if (obstacles.has(to)) return "That square is blocked.";
  const occupant = board.get(to);
  const piece = board.get(from);
  if (occupant && piece && occupant.color === piece.color) return "Your own piece is already on that square.";
  switch (type) {
    case "p":
      return "Pawns step straight forward and capture one square diagonally.";
    case "n":
      return "Knights move in an L: two squares one way, then one square across.";
    case "b":
      return "Bishops travel on diagonals and cannot jump over pieces.";
    case "r":
      return "Rooks travel along ranks and files and cannot jump over pieces.";
    case "q":
      return "Queens combine rook and bishop lines, but cannot jump over pieces.";
    case "k":
      return "The king moves exactly one square at a time.";
    default:
      return "That piece cannot move there.";
  }
}

function applyLegalChessMove(
  spec: LearningExerciseSpec,
  state: LearningSessionState,
  from: string,
  to: string,
  promotion?: string
): LearningMoveOutcome {
  let game: Chess;
  try {
    game = new Chess(state.fen);
  } catch {
    return rejected(state, "This position could not be loaded.");
  }

  const wanted = promotion || String(spec.goalConfig?.promotionPiece || "q").toLowerCase();
  let move: any;
  try {
    move = game.move({ from, to, promotion: wanted });
  } catch {
    return rejected(state, "That is not a legal move in this position.");
  }
  if (!move) return rejected(state, "That is not a legal move in this position.");

  const info: LegalMoveInfo = {
    from: String(move.from),
    to: String(move.to),
    san: String(move.san),
    uci: uciOf(String(move.from), String(move.to), move.promotion),
    flags: String(move.flags || ""),
    captured: move.captured ? String(move.captured) : undefined,
    promotion: move.promotion ? String(move.promotion) : undefined,
  };
  const candidates = [info.uci, `${info.from}${info.to}`, info.san];

  if (usesScript(spec)) return applyScriptedMove(spec, state, game, info, candidates);

  // Most rule lessons ("give check", "castle", "promote") should reward any move that
  // genuinely does the thing, not just the one line the author happened to type.
  const acceptAnyGoalMove = Boolean(spec.goalConfig?.acceptAnyGoalMove);
  const answerKey = acceptAnyGoalMove ? undefined : singleMoveAccepted(spec, candidates);
  if (answerKey === false) return rejected(state, "Legal move, but not the one this exercise is looking for.");
  if (!legalChessGoalReached(spec, game, info)) {
    return rejected(state, goalMissReason(spec.goalType, spec, info));
  }

  const nextState: LearningSessionState = {
    ...state,
    fen: game.fen(),
    studentMoves: [...state.studentMoves, info.uci],
    moveCount: state.moveCount + 1,
    lastMove: { from: info.from, to: info.to },
    status: "solved",
  };
  return { state: nextState, ok: true, solved: true, failed: false };
}

function applyScriptedMove(
  spec: LearningExerciseSpec,
  state: LearningSessionState,
  game: Chess,
  info: LegalMoveInfo,
  candidates: string[]
): LearningMoveOutcome {
  const steps = scriptSteps(spec);
  const current = steps[state.step];
  if (!current || current.actor !== "student") return rejected(state, "It is not your turn in this sequence.");
  if (!moveMatches(current.acceptedMoves, candidates)) {
    return rejected(state, "Good try, but the sequence continues with a different move.");
  }

  let step = state.step + 1;
  let opponentMove: LearningMoveOutcome["opponentMove"];

  // Play every scripted reply that follows, so the student always sees the answer.
  while (step < steps.length && steps[step].actor === "opponent") {
    const played = playScriptedOpponentMove(game, steps[step].move);
    if (!played) {
      return {
        state: { ...state, status: "failed" },
        ok: false,
        solved: false,
        failed: true,
        reason: "This exercise has a broken reply script.",
      };
    }
    opponentMove = { from: played.from, to: played.to, san: played.san };
    step += 1;
  }

  const nextState: LearningSessionState = {
    ...state,
    fen: game.fen(),
    studentMoves: [...state.studentMoves, info.uci],
    moveCount: state.moveCount + 1,
    step,
    lastMove: { from: info.from, to: info.to },
  };

  if (step >= steps.length) {
    if (!legalChessGoalReached(spec, game, info)) return rejected(state, goalMissReason(spec.goalType, spec, info));
    return { state: { ...nextState, status: "solved" }, ok: true, solved: true, failed: false, opponentMove };
  }

  return { state: nextState, ok: true, solved: false, failed: false, opponentMove };
}

function playScriptedOpponentMove(game: Chess, notation?: string) {
  const token = normalizeMoveToken(String(notation || ""));
  if (!token) return null;
  try {
    const move: any = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)
      ? game.move({ from: token.slice(0, 2), to: token.slice(2, 4), promotion: token.slice(4) || "q" })
      : game.move(token);
    if (!move) return null;
    return { from: String(move.from), to: String(move.to), san: String(move.san) };
  } catch {
    return null;
  }
}

function goalMissReason(goalType: string, spec?: LearningExerciseSpec, move?: LegalMoveInfo) {
  // An underpromotion exercise fails most often because the student took the queen
  // out of habit. Say that, rather than telling them to promote a pawn they just promoted.
  if (goalType === "PROMOTE" && move?.flags.includes("p")) {
    const wanted = String(spec?.goalConfig?.promotionPiece || "").toLowerCase();
    const names: Record<string, string> = { q: "a queen", r: "a rook", b: "a bishop", n: "a knight" };
    if (wanted && names[wanted]) return `You promoted, but this exercise needs ${names[wanted]}.`;
  }
  switch (goalType) {
    case "CAPTURE_TARGET":
      return "That move does not capture the piece this exercise is about.";
    case "GIVE_CHECK":
      return "That move does not attack the king.";
    case "CHECKMATE":
      return "That leaves the king a way out. Look for the move that ends the game.";
    case "CASTLE":
      return "This exercise is about castling. Move the king two squares toward a rook.";
    case "PROMOTE":
      return "Push the pawn to the last rank and promote it.";
    case "EN_PASSANT":
      return "Look for the en-passant capture.";
    case "ESCAPE_CHECK":
      return "The king is still in danger after that move.";
    default:
      return "That is not the idea this exercise is training.";
  }
}

/* ------------------------------------------------------------------ *
 * Non-board interactions
 * ------------------------------------------------------------------ */

export function correctSquares(spec: LearningExerciseSpec) {
  const fromConfig = spec.goalConfig?.correctSquares;
  if (Array.isArray(fromConfig)) return fromConfig.filter(isSquare);
  const single = spec.goalConfig?.correctSquare;
  return isSquare(single) ? [single] : [];
}

export function applySquareSelection(
  spec: LearningExerciseSpec,
  state: LearningSessionState,
  square: string
): LearningMoveOutcome {
  if (state.status !== "playing") {
    return { state, ok: false, solved: state.status === "solved", failed: false };
  }
  const wanted = correctSquares(spec);
  if (!wanted.length) return rejected(state, "This exercise has no answer key yet.");
  if (!wanted.includes(square)) {
    return rejected(state, "Not that square. Look again at what is attacked or defended.");
  }
  if (state.selectedSquares.includes(square)) {
    return { state, ok: true, solved: false, failed: false, reason: "You already found that square." };
  }
  const selectedSquares = [...state.selectedSquares, square];
  const solved = wanted.every((item) => selectedSquares.includes(item));
  return {
    state: { ...state, selectedSquares, status: solved ? "solved" : "playing" },
    ok: true,
    solved,
    failed: false,
  };
}

/* ------------------------------------------------------------------ *
 * INFORMATION slides
 *
 * A teaching screen rather than a puzzle: a few key points and, optionally, a
 * worked line the student can step through on the board. Nothing to get wrong,
 * so the "solution" is simply reading it.
 * ------------------------------------------------------------------ */

export type DemoStep = {
  fen: string;
  /** Empty on the opening position. */
  label: string;
  from?: string;
  to?: string;
};

export function informationKeyPoints(spec: LearningExerciseSpec): string[] {
  const points = spec.goalConfig?.keyPoints;
  return Array.isArray(points) ? points.map(String).filter(Boolean) : [];
}

export function informationDemoMoves(spec: LearningExerciseSpec): string[] {
  const moves = spec.goalConfig?.demoMoves;
  return Array.isArray(moves) ? moves.map((move) => normalizeMoveToken(String(move)).toLowerCase()) : [];
}

/**
 * Replays the slide's demo line for display. Returns every position along the way,
 * plus the first problem found, so the authoring screen can report a bad move
 * instead of the board silently stopping halfway.
 */
export function buildDemoTimeline(spec: LearningExerciseSpec): { steps: DemoStep[]; error?: string } {
  const steps: DemoStep[] = [{ fen: resolveStartingFen(spec), label: "Starting position" }];
  const moves = informationDemoMoves(spec);
  if (!moves.length) return { steps };

  if (spec.rulesMode === "MOVEMENT_TRAINER") {
    let board = parseMovementBoard(resolveStartingFen(spec));
    const obstacles = obstacleSet(spec);
    const side = spec.sideToMove === "black" ? "b" : "w";
    for (const move of moves) {
      if (!/^[a-h][1-8][a-h][1-8]$/.test(move)) return { steps, error: `"${move}" is not a move in the form e2e4.` };
      const from = move.slice(0, 2);
      const to = move.slice(2, 4);
      if (!movementMoveIsLegal(board, obstacles, from, to)) {
        return { steps, error: `The piece on ${from} cannot move to ${to}.` };
      }
      const piece = board.get(from)!;
      const next = new Map(board);
      next.delete(from);
      next.set(to, piece);
      board = next;
      steps.push({ fen: serializeMovementBoard(board, side), label: `${from}-${to}`, from, to });
    }
    return { steps };
  }

  let game: Chess;
  try {
    game = new Chess(resolveStartingFen(spec));
  } catch {
    return { steps, error: "This position could not be loaded." };
  }
  for (const move of moves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return { steps, error: `"${move}" is not a move in the form e2e4.` };
    try {
      const played: any = game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || "q" });
      if (!played) return { steps, error: `${move} is not legal in this position.` };
      steps.push({ fen: game.fen(), label: String(played.san), from: String(played.from), to: String(played.to) });
    } catch {
      return { steps, error: `${move} is not legal in this position.` };
    }
  }
  return { steps };
}

export function choiceOptions(spec: LearningExerciseSpec): string[] {
  const options = spec.goalConfig?.options;
  return Array.isArray(options) ? options.map(String) : [];
}

export function applyChoice(
  spec: LearningExerciseSpec,
  state: LearningSessionState,
  option: string
): LearningMoveOutcome {
  if (state.status !== "playing") {
    return { state, ok: false, solved: state.status === "solved", failed: false };
  }
  const correct = String(spec.goalConfig?.correctOption || "");
  if (!correct) return rejected(state, "This question has no answer key yet.");
  if (option !== correct) return rejected(state, "Not quite. Read the question once more.");
  return {
    state: { ...state, selectedSquares: [option], status: "solved" },
    ok: true,
    solved: true,
    failed: false,
  };
}

/* ------------------------------------------------------------------ *
 * Replay / verification
 * ------------------------------------------------------------------ */

export type LearningVerificationInput = {
  moves?: string[];
  selections?: string[];
  choice?: string;
};

/**
 * Replays what the browser reported through the same rules and reports whether the
 * exercise was genuinely solved, so stars and XP have to be earned.
 */
export function verifyLearningSolution(spec: LearningExerciseSpec, input: LearningVerificationInput) {
  if (spec.interactionMode === "INFORMATION") return { solved: true, moveCount: 0 };

  if (spec.rulesMode === "QUESTION" || spec.interactionMode === "MULTIPLE_CHOICE") {
    const outcome = applyChoice(spec, createSession(spec), String(input.choice || ""));
    return { solved: outcome.solved, moveCount: 0 };
  }

  if (spec.interactionMode === "SELECT_SQUARE") {
    let state = createSession(spec);
    for (const square of input.selections || []) {
      const outcome = applySquareSelection(spec, state, String(square));
      state = outcome.state;
      if (outcome.solved) return { solved: true, moveCount: 0 };
    }
    return { solved: state.status === "solved", moveCount: 0 };
  }

  let state = createSession(spec);
  for (const notation of input.moves || []) {
    const token = normalizeMoveToken(String(notation));
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) return { solved: false, moveCount: state.moveCount };
    const outcome = applyMove(spec, state, token.slice(0, 2), token.slice(2, 4), token.slice(4) || undefined);
    state = outcome.state;
    if (outcome.solved) return { solved: true, moveCount: state.moveCount };
    if (outcome.failed || !outcome.ok) return { solved: false, moveCount: state.moveCount };
  }
  return { solved: state.status === "solved", moveCount: state.moveCount };
}

/** Short human-readable objective shown above the board. */
export function describeGoal(spec: LearningExerciseSpec) {
  const target = goalSquare(spec);
  switch (spec.goalType) {
    case "REACH_SQUARE":
      return target ? `Reach ${target}.` : "Reach the highlighted square.";
    case "COLLECT_TARGETS": {
      const quota = targetQuota(spec);
      return quota ? `Visit all ${quota} highlighted squares.` : "Visit every highlighted square.";
    }
    case "CAPTURE_TARGET":
      return target ? `Capture the piece on ${target}.` : "Win material with the right capture.";
    case "SELECT_CORRECT_SQUARE": {
      const wanted = correctSquares(spec);
      return wanted.length > 1 ? `Click the ${wanted.length} correct squares.` : "Click the correct square.";
    }
    case "GIVE_CHECK":
      return "Play a move that gives check.";
    case "ESCAPE_CHECK":
      return "Get out of check.";
    case "CHECKMATE":
      return "Finish the game with checkmate.";
    case "CASTLE":
      return "Castle.";
    case "PROMOTE": {
      const piece = String(spec.goalConfig?.promotionPiece || "").toLowerCase();
      const names: Record<string, string> = { q: "a queen", r: "a rook", b: "a bishop", n: "a knight" };
      return piece && names[piece] ? `Promote to ${names[piece]}.` : "Promote the pawn.";
    }
    case "EN_PASSANT":
      return "Capture en passant.";
    case "MULTIPLE_CHOICE":
      return String(spec.goalConfig?.prompt || "Choose the best answer.");
    case "INFORMATION":
      return informationDemoMoves(spec).length ? "Read this and step through the example." : "Read this, then continue.";
    default:
      return spec.interactionMode === "INFORMATION" ? "Read this, then continue." : "Complete the lesson goal.";
  }
}

export function highlightSquares(spec: LearningExerciseSpec, state: LearningSessionState) {
  if (spec.goalType === "COLLECT_TARGETS") {
    return declaredTargets(spec).filter((square) => !state.collectedTargets.includes(square));
  }
  if (spec.goalType === "REACH_SQUARE") {
    const target = goalSquare(spec);
    return target ? [target] : [];
  }
  return [];
}
