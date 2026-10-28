import { buildGame, parsePgnPuzzle, puzzleStudentColor } from "@/lib/pgnPuzzle";
import { MCQ_COUNT, POSITION_COUNT, levelNumberFromName } from "@/lib/exams/examRules";
import { cleanPositionQuestion, positionQuestionFor } from "@/lib/exams/examQuestions";

/**
 * The question bank for one level, read from that level's homework templates,
 * and the draw that turns it into a paper. Pure: the service loads the
 * templates, everything that decides what goes on a paper is here and tested.
 */

export type BankSource = { template: string; templateTitle: string; activityId: string; itemId: string };

export type BankMcq = {
  bankKey: string;
  question: string;
  positionFen?: string;
  options: { id: string; text: string; correct: boolean }[];
  explanation?: string;
  topicName: string;
  source: BankSource;
  /** Made from one of the level's positions ("what is the best move?") rather than taken from an MCQ homework. */
  generated?: boolean;
};

export type BankPosition = {
  bankKey: string;
  topicName: string;
  title: string;
  /** The line shown above the board: from the homework or PGN when it has one, otherwise written from the position. */
  question: string;
  pgn: string;
  startFen: string;
  solution: string[];
  studentColor: "white" | "black";
  source: BankSource;
};

export type ExamBank = { mcqs: BankMcq[]; positions: BankPosition[] };

type TemplateLike = {
  _id: unknown;
  title?: string;
  topicName?: string;
  levelName?: string;
  /** The tier, already resolved from the template or its course. */
  tier?: string;
  activities?: any[];
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function fenKey(fen: string) {
  // Placement, side to move, castling, en passant: move counters don't make a different position.
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

export function templateMatchesLevel(template: TemplateLike, tier: string, levelNumber: number) {
  return template.tier === tier && levelNumberFromName(template.levelName) === levelNumber;
}

function mcqFromItem(template: TemplateLike, activity: any, item: any, index: number): BankMcq | null {
  const question = clean(item?.question);
  const options = (Array.isArray(item?.options) ? item.options : [])
    .map((option: any, optionIndex: number) => ({ id: clean(option?.id) || `o${optionIndex + 1}`, text: clean(option?.text), correct: Boolean(option?.correct) }))
    .filter((option: { text: string }) => option.text);
  // One try, one right answer: a question with no right option, or several, can't be marked fairly.
  if (!question || options.length < 2 || options.filter((option: { correct: boolean }) => option.correct).length !== 1) return null;
  if (new Set(options.map((option: { id: string }) => option.id)).size !== options.length) return null;
  const positionFen = clean(item?.positionFen || item?.fen) || undefined;
  const itemId = clean(item?.id) || `i${index + 1}`;
  return {
    bankKey: `mcq:${positionFen ? fenKey(positionFen) : ""}:${question.toLowerCase()}`,
    question,
    positionFen,
    options,
    explanation: clean(item?.explanation) || undefined,
    topicName: clean(template.topicName) || "General",
    source: { template: String(template._id), templateTitle: clean(template.title), activityId: clean(activity?.id || activity?._id), itemId },
  };
}

function positionFromItem(template: TemplateLike, activity: any, item: any, index: number): BankPosition | null {
  const pgn = String(item?.pgn || "").trim();
  if (!pgn) return null;
  const puzzle = parsePgnPuzzle(pgn);
  if (!puzzle.valid || !puzzle.moves.length) return null;
  const itemId = clean(item?.id) || `i${index + 1}`;
  const topicName = clean(template.topicName) || "General";
  const solution = puzzle.moves.map((move) => move.san);
  const studentColor = puzzleStudentColor(puzzle);
  return {
    bankKey: `pos:${fenKey(puzzle.start)}`,
    topicName,
    title: clean(item?.title || item?.pgnTitle) || `Position ${index + 1}`,
    question: positionQuestionFor({ question: cleanPositionQuestion(item?.question || item?.prompt), pgn, topicName, studentColor, solution }),
    pgn,
    startFen: puzzle.start,
    solution,
    studentColor,
    source: { template: String(template._id), templateTitle: clean(template.title), activityId: clean(activity?.id || activity?._id), itemId },
  };
}

/**
 * Every usable question in these templates: single-answer MCQs from quiz
 * activities and solvable positions from PGN quizzes. Repeats (the same
 * question, or the same position, in two homeworks) are kept once.
 */
export function extractBank(templates: TemplateLike[]): ExamBank {
  const mcqs = new Map<string, BankMcq>();
  const positions = new Map<string, BankPosition>();
  for (const template of templates) {
    for (const activity of template.activities || []) {
      const items = Array.isArray(activity?.items) ? activity.items : [];
      if (activity?.type === "quiz") {
        items.forEach((item: any, index: number) => {
          const mcq = mcqFromItem(template, activity, item, index);
          if (mcq && !mcqs.has(mcq.bankKey)) mcqs.set(mcq.bankKey, mcq);
        });
      } else if (activity?.type === "study_pgn" && activity?.source?.kind === "pgn_quiz") {
        items.forEach((item: any, index: number) => {
          const position = positionFromItem(template, activity, item, index);
          if (position && !positions.has(position.bankKey)) positions.set(position.bankKey, position);
        });
      }
    }
  }
  return { mcqs: Array.from(mcqs.values()), positions: Array.from(positions.values()) };
}

export class ExamBankError extends Error {}

function shuffle<T>(items: T[], random: () => number) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/**
 * Takes `count` questions, one topic at a time in turn, so the paper covers the
 * whole level rather than whichever topic has the most homework.
 */
export function drawAcrossTopics<T extends { topicName: string }>(pool: T[], count: number, random: () => number = Math.random): T[] {
  const byTopic = new Map<string, T[]>();
  for (const item of shuffle(pool, random)) {
    const list = byTopic.get(item.topicName) || [];
    list.push(item);
    byTopic.set(item.topicName, list);
  }
  const queues = shuffle(Array.from(byTopic.values()), random);
  const picked: T[] = [];
  while (picked.length < count && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) picked.push(next);
      if (picked.length >= count) break;
    }
  }
  return picked;
}

const OPTION_IDS = ["a", "b", "c", "d"];

/** The bank key of the position a generated MCQ was made from. */
export function sourcePositionKey(mcq: { bankKey: string }) {
  return mcq.bankKey.startsWith("gen:") ? `pos:${mcq.bankKey.slice(4)}` : "";
}

/**
 * "White to play. What is the best move?" from a position whose solution
 * starts with that move. The three wrong choices are other legal moves,
 * checks and captures first so they look worth considering. When the answer
 * mates, no other mating move is offered, so there is only one right choice.
 * Null when the position has fewer than three other legal moves.
 */
export function bestMoveMcq(position: BankPosition, random: () => number = Math.random): BankMcq | null {
  const answer = position.solution[0];
  if (!answer) return null;
  const game = buildGame(position.startFen);
  let legal: string[] = [];
  try {
    legal = game.moves();
  } catch {
    return null;
  }
  if (!legal.includes(answer)) return null;
  const mates = /#$/.test(answer);
  const others = legal.filter((san) => san !== answer && !(mates && /#$/.test(san)));
  const forcing = shuffle(others.filter((san) => /[+#x]/.test(san)), random);
  const quiet = shuffle(others.filter((san) => !/[+#x]/.test(san)), random);
  const wrong = [...forcing, ...quiet].slice(0, 3);
  if (wrong.length < 3) return null;
  const choices = shuffle([answer, ...wrong], random);
  const side = position.studentColor === "black" ? "Black" : "White";
  return {
    bankKey: `gen:${position.bankKey.replace(/^pos:/, "")}`,
    question: `${side} to play. What is the best move?`,
    positionFen: position.startFen,
    options: choices.map((san, index) => ({ id: OPTION_IDS[index], text: san, correct: san === answer })),
    explanation: `${answer} is the first move of the solution: ${position.solution.join(" ")}.`,
    topicName: position.topicName,
    source: position.source,
    generated: true,
  };
}

/** Best-move MCQs from every position that is not already on the paper as a position. */
export function generatedMcqPool(positions: BankPosition[], positionsOnPaper: { bankKey: string }[], random: () => number = Math.random) {
  const used = new Set(positionsOnPaper.map((position) => position.bankKey));
  return positions
    .filter((position) => !used.has(position.bankKey))
    .map((position) => bestMoveMcq(position, random))
    .filter((mcq): mcq is BankMcq => Boolean(mcq));
}

/**
 * Positions first (they cannot be made up), then the MCQs: the level's own
 * MCQs, topped up with best-move MCQs made from the positions left over when
 * the homework has fewer than ten.
 */
export function drawPaper(bank: ExamBank, random: () => number = Math.random) {
  if (bank.positions.length < POSITION_COUNT) {
    throw new ExamBankError(`This level's homework has ${bank.positions.length} usable positions. A paper needs ${POSITION_COUNT}.`);
  }
  const positions = drawAcrossTopics(bank.positions, POSITION_COUNT, random);
  const mcqs = drawAcrossTopics(bank.mcqs, MCQ_COUNT, random);
  if (mcqs.length < MCQ_COUNT) {
    mcqs.push(...drawAcrossTopics(generatedMcqPool(bank.positions, positions, random), MCQ_COUNT - mcqs.length, random));
  }
  if (mcqs.length < MCQ_COUNT) {
    throw new ExamBankError(
      `This level's homework has ${bank.mcqs.length} usable MCQs and ${bank.positions.length} positions. After the ${POSITION_COUNT} positions on the paper, only ${mcqs.length - bank.mcqs.length} more MCQs could be made from the rest, and a paper needs ${MCQ_COUNT}. Add MCQ or PGN homework to this level.`
    );
  }
  return { mcqs, positions };
}

/** How many MCQs a level can field: its own plus those made from positions beyond the paper's 16. */
export function mcqCapacity(bank: ExamBank) {
  const spare = Math.max(0, bank.positions.length - POSITION_COUNT);
  return { own: bank.mcqs.length, fromPositions: spare };
}

/**
 * A different question for one slot: from the same topic when the bank has
 * another one, otherwise any topic, never one already on the paper.
 */
export function pickReplacement<T extends { bankKey: string; topicName: string }>(
  pool: T[],
  onPaper: { bankKey: string }[],
  current: { bankKey: string; topicName?: string },
  random: () => number = Math.random
): T | null {
  const used = new Set(onPaper.map((item) => item.bankKey));
  const candidates = pool.filter((item) => !used.has(item.bankKey) && item.bankKey !== current.bankKey);
  if (!candidates.length) return null;
  const sameTopic = candidates.filter((item) => item.topicName === current.topicName);
  const from = sameTopic.length ? sameTopic : candidates;
  return from[Math.floor(random() * from.length)] || null;
}
