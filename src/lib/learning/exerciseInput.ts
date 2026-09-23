import { isSquare, normalizeMoveToken } from "@/lib/learning/engine";

/**
 * Whitelist for exercise fields coming from the authoring screen. Everything the
 * student engine reads is normalised here, so a typo in the editor becomes an empty
 * array rather than a runtime crash on the board.
 */

const RULES_MODES = ["MOVEMENT_TRAINER", "LEGAL_CHESS", "QUESTION"] as const;
const INTERACTION_MODES = [
  "BOARD_MOVE",
  "BOARD_SEQUENCE",
  "COLLECT_TARGETS",
  "MULTIPLE_CHOICE",
  "SELECT_SQUARE",
  "INFORMATION",
] as const;
const GOAL_TYPES = [
  "REACH_SQUARE",
  "COLLECT_TARGETS",
  "CAPTURE_TARGET",
  "SELECT_CORRECT_SQUARE",
  "GIVE_CHECK",
  "ESCAPE_CHECK",
  "CHECKMATE",
  "CASTLE",
  "PROMOTE",
  "EN_PASSANT",
  "MULTIPLE_CHOICE",
  "INFORMATION",
] as const;
const STATUSES = ["draft", "published", "archived"] as const;

function pick<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const candidate = String(value || "");
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T[number]) : fallback;
}

function text(value: unknown, max = 600) {
  return String(value ?? "").trim().slice(0, max);
}

function squareList(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map(String).filter(isSquare))).slice(0, 32) : [];
}

function moveList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => normalizeMoveToken(String(item)).toLowerCase())
        .filter((item) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(item))
        .slice(0, 40)
    : [];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function goalConfigFor(input: any, interactionMode: string) {
  const raw = input?.goalConfig && typeof input.goalConfig === "object" ? input.goalConfig : {};
  const config: Record<string, any> = {};

  if (isSquare(raw.targetSquare)) config.targetSquare = raw.targetSquare;
  if (Array.isArray(raw.correctSquares)) config.correctSquares = squareList(raw.correctSquares);
  if (raw.prompt) config.prompt = text(raw.prompt, 300);
  if (raw.acceptAnyGoalMove) config.acceptAnyGoalMove = true;
  if (["q", "r", "b", "n"].includes(String(raw.promotionPiece || "").toLowerCase())) {
    config.promotionPiece = String(raw.promotionPiece).toLowerCase();
  }
  if (Number(raw.requiredTargets) > 0) config.requiredTargets = clampNumber(raw.requiredTargets, 1, 32, 1);

  if (interactionMode === "INFORMATION") {
    config.keyPoints = Array.isArray(raw.keyPoints)
      ? raw.keyPoints.map((point: unknown) => text(point, 300)).filter(Boolean).slice(0, 8)
      : [];
    config.demoMoves = moveList(raw.demoMoves);
  }

  if (interactionMode === "MULTIPLE_CHOICE") {
    const options = Array.isArray(raw.options)
      ? Array.from(new Set(raw.options.map((option: unknown) => text(option, 160)).filter(Boolean))).slice(0, 6)
      : [];
    config.options = options;
    config.correctOption = text(raw.correctOption, 160);
  }

  return config;
}

export function sanitizeExerciseInput(input: any) {
  const rulesMode = pick(input?.rulesMode, RULES_MODES, "LEGAL_CHESS");
  const interactionMode = pick(input?.interactionMode, INTERACTION_MODES, "BOARD_MOVE");

  const opponentScript = Array.isArray(input?.opponentScript)
    ? input.opponentScript
        .map((step: any) => ({
          actor: step?.actor === "opponent" ? ("opponent" as const) : ("student" as const),
          move: normalizeMoveToken(String(step?.move || "")).toLowerCase() || undefined,
          acceptedMoves: moveList(step?.acceptedMoves),
        }))
        .filter((step: any) => (step.actor === "opponent" ? Boolean(step.move) : step.acceptedMoves.length > 0))
        .slice(0, 20)
    : [];

  const acceptedSolutions = Array.isArray(input?.acceptedSolutions)
    ? input.acceptedSolutions
        .map((solution: any) => ({ moves: moveList(solution?.moves) }))
        .filter((solution: any) => solution.moves.length > 0)
        .slice(0, 6)
    : [];

  const hints = Array.isArray(input?.hints)
    ? input.hints
        .map((hint: any) => ({ text: text(hint?.text, 400), showAfterErrors: clampNumber(hint?.showAfterErrors, 0, 10, 1) }))
        .filter((hint: any) => Boolean(hint.text))
        .slice(0, 4)
    : [];

  return {
    title: text(input?.title, 140) || "Untitled exercise",
    description: text(input?.description, 600),
    status: pick(input?.status, STATUSES, "draft"),
    rulesMode,
    interactionMode,
    startingPosition: text(input?.startingPosition, 120) || "start",
    orientation: input?.orientation === "black" ? ("black" as const) : ("white" as const),
    sideToMove: input?.sideToMove === "black" ? ("black" as const) : ("white" as const),
    goalType: pick(input?.goalType, GOAL_TYPES, "REACH_SQUARE"),
    goalConfig: goalConfigFor(input, interactionMode),
    acceptedSolutions,
    opponentScript,
    targets: squareList(input?.targets),
    obstacles: squareList(input?.obstacles),
    hints,
    idealMoves: clampNumber(input?.idealMoves, 1, 40, acceptedSolutions[0]?.moves.length || 1),
    maxMoves: clampNumber(input?.maxMoves, 0, 40, 0),
    explanation: text(input?.explanation, 600),
    successMessage: text(input?.successMessage, 300) || "Correct.",
    failureMessage: text(input?.failureMessage, 300) || "Not yet. Try again.",
    difficulty: clampNumber(input?.difficulty, 1, 3, 1) as 1 | 2 | 3,
  };
}
