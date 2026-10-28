import { parsePgnPuzzle, puzzleStudentColor } from "@/lib/pgnPuzzle";
import { MCQ_COUNT, POSITION_COUNT, levelNumberFromName } from "@/lib/exams/examRules";

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
};

export type BankPosition = {
  bankKey: string;
  topicName: string;
  title: string;
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
  return {
    bankKey: `pos:${fenKey(puzzle.start)}`,
    topicName: clean(template.topicName) || "General",
    title: clean(item?.title || item?.pgnTitle) || `Position ${index + 1}`,
    pgn,
    startFen: puzzle.start,
    solution: puzzle.moves.map((move) => move.san),
    studentColor: puzzleStudentColor(puzzle),
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

export function drawPaper(bank: ExamBank, random: () => number = Math.random) {
  if (bank.mcqs.length < MCQ_COUNT || bank.positions.length < POSITION_COUNT) {
    throw new ExamBankError(
      `This level's homework has ${bank.mcqs.length} usable MCQs and ${bank.positions.length} usable positions. A paper needs ${MCQ_COUNT} and ${POSITION_COUNT}.`
    );
  }
  return {
    mcqs: drawAcrossTopics(bank.mcqs, MCQ_COUNT, random),
    positions: drawAcrossTopics(bank.positions, POSITION_COUNT, random),
  };
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
