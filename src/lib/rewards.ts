export type RewardResult = {
  xp: number;
  coins: number;
  badge?: string;
};

const XP_TO_COIN_RATIO = 4;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function cleanInt(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function cleanPercent(value: unknown) {
  return clamp(Number(value), 0, 100);
}

function coinsForXp(xp: number) {
  return clamp(Math.round(xp / XP_TO_COIN_RATIO), 0, 4);
}

export function calculateHomeworkReward(input: {
  totalAutoChecked: number;
  accuracy: number;
  mistakes?: number;
  hintsUsed?: number;
  attemptsUsed?: number;
  isLate?: boolean;
}): RewardResult {
  const totalAutoChecked = cleanInt(input.totalAutoChecked);
  if (!totalAutoChecked) return { xp: 2, coins: 1 };

  const accuracy = cleanPercent(input.accuracy);
  const mistakes = cleanInt(input.mistakes);
  const hintsUsed = cleanInt(input.hintsUsed);
  const attemptsUsed = Math.max(1, cleanInt(input.attemptsUsed, 1));
  const qualityPenalty = Math.min(6, mistakes + hintsUsed + Math.max(0, attemptsUsed - 1));
  const latePenalty = input.isLate ? 2 : 0;
  const xp = Math.round(clamp(6 + accuracy * 0.18 - qualityPenalty - latePenalty, 3, 24));
  const badge =
    accuracy === 100 && hintsUsed === 0 && mistakes === 0
      ? "Homework Hero"
      : accuracy >= 90
        ? "Homework Ace"
        : undefined;

  return { xp, coins: coinsForXp(xp), badge };
}

export function calculateLiveQuestionReward(input: {
  completedItems: number;
  totalItems: number;
  correct: boolean;
  score?: number;
  hintsUsed?: number;
  attemptsUsed?: number;
}): RewardResult {
  const totalItems = cleanInt(input.totalItems);
  const completedItems = cleanInt(input.completedItems);
  const completion = totalItems ? completedItems / totalItems : input.correct ? 1 : 0.5;
  const accuracy = input.correct ? 1 : Math.max(0.35, Math.min(0.75, completion));
  const penalty = Math.min(4, cleanInt(input.hintsUsed) + Math.max(0, cleanInt(input.attemptsUsed, 1) - 1));
  const xp = Math.round(clamp(3 + accuracy * 9 - penalty, 2, 12));
  return { xp, coins: coinsForXp(xp), badge: input.correct ? "Classroom Sharp" : undefined };
}

export function calculateLearningReward(input: {
  completed: boolean;
  stars: number;
  difficulty?: number;
  incorrectMoves?: number;
  hintsUsed?: number;
}): RewardResult {
  const stars = clamp(cleanInt(input.stars), 0, 3);
  const difficultyBonus = clamp(cleanInt(input.difficulty, 1) - 1, 0, 2);
  const penalty = Math.min(4, cleanInt(input.incorrectMoves) + cleanInt(input.hintsUsed));
  const xp = input.completed
    ? Math.round(clamp(4 + stars * 3 + difficultyBonus - penalty, 4, 15))
    : 2;
  const badge = input.completed && stars === 3 && penalty === 0 ? "Lesson Perfect" : undefined;
  return { xp, coins: coinsForXp(xp), badge };
}

export function calculateTacticsReward(input: {
  solved: boolean;
  rating: number;
  mistakes?: number;
  hintsUsed?: number;
  timeSeconds?: number;
  trainerType?: "tactics" | "king_hunt";
}): RewardResult {
  if (!input.solved) return { xp: 2, coins: 0 };
  const ratingBonus = clamp(Math.floor((cleanInt(input.rating, 1000) - 800) / 250), 0, 4);
  const speedBonus = cleanInt(input.timeSeconds) > 0 && cleanInt(input.timeSeconds) <= 45 ? 2 : 0;
  const penalty = Math.min(6, cleanInt(input.mistakes) * 2 + cleanInt(input.hintsUsed));
  const xp = Math.round(clamp(9 + ratingBonus + speedBonus - penalty, 4, 16));
  const badge =
    cleanInt(input.mistakes) === 0 && cleanInt(input.hintsUsed) === 0 && cleanInt(input.rating) >= 1000
      ? input.trainerType === "king_hunt" ? "King Hunter" : "Clean Tactician"
      : undefined;
  return { xp, coins: coinsForXp(xp), badge };
}

export function calculateSquareTrainerReward(input: {
  correct: number;
  mistakes: number;
  bestStreak?: number;
  durationSeconds?: number;
}): RewardResult {
  const correct = cleanInt(input.correct);
  const mistakes = cleanInt(input.mistakes);
  const attempts = correct + mistakes;
  if (!attempts) return { xp: 1, coins: 0 };

  const accuracy = correct / attempts;
  const completion = clamp(attempts / 20, 0.35, 1);
  const streakBonus = Math.min(2, Math.floor(cleanInt(input.bestStreak) / 10));
  const xp = Math.round(clamp(4 + accuracy * completion * 10 + streakBonus, 2, 16));
  const badge = attempts >= 20 && accuracy >= 0.85 ? "Coordinate Sharp Shooter" : undefined;
  return { xp, coins: coinsForXp(xp), badge };
}

export function calculatePlayComputerReward(input: {
  outcome: string;
  difficultyLevel?: number;
}): RewardResult {
  const difficultyBonus = clamp(Math.floor(cleanInt(input.difficultyLevel, 1) / 3), 0, 3);
  const outcome = String(input.outcome || "").toLowerCase();
  const xp = outcome === "victory"
    ? 12 + difficultyBonus
    : outcome === "draw"
      ? 8 + Math.min(2, difficultyBonus)
      : outcome === "resigned"
        ? 3
        : 4;
  return {
    xp,
    coins: coinsForXp(xp),
    badge: outcome === "victory" && cleanInt(input.difficultyLevel) >= 8 ? "Bot Breaker" : undefined,
  };
}

export function calculateTournamentGameReward(result: string, side: "white" | "black"): RewardResult {
  const won = (side === "white" && result === "1-0") || (side === "black" && result === "0-1");
  const drew = result === "1/2-1/2";
  const xp = won ? 12 : drew ? 7 : 4;
  return { xp, coins: coinsForXp(xp), badge: won ? "Tournament Winner" : undefined };
}
