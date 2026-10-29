import { buildGame } from "@/lib/pgnPuzzle";
import { MCQ_MARKS, POSITION_MARKS, mcqMarks, positionMarks, roundMarks } from "@/lib/exams/examRules";

/**
 * What a finished exam says beyond the total: marks by topic, and, for the
 * student only, the right answers to what they got wrong. Pure and free of
 * server imports, so the admin preview builds exactly what a student sees.
 *
 * Topic reports go to parents and coaches and never carry an answer. The
 * answer review is part of the student's own result and nothing else.
 */

/** A topic at or above this share of its marks is a strength; below the weak line it needs work. */
export const STRONG_TOPIC_PERCENT = 75;
export const WEAK_TOPIC_PERCENT = 50;
const UNNAMED_TOPIC = "Other";

export type TopicScore = {
  topic: string;
  earned: number;
  max: number;
  percent: number;
  mcqRight: number;
  mcqTotal: number;
  positionsSolved: number;
  positionsTotal: number;
};

export type TopicBreakdown = { topics: TopicScore[]; strong: string[]; weak: string[] };

type McqInput = { id: string; topicName?: string };
type PositionInput = { id: string; topicName?: string };
type AnswerInput = { questionId: string; correct?: boolean };
type ProgressInput = { questionId: string; wrongMoves?: number; hintsUsed?: number; solved?: boolean };

export function topicBreakdown(input: { mcqs?: McqInput[]; positions?: PositionInput[]; mcqAnswers?: AnswerInput[]; positionProgress?: ProgressInput[] }): TopicBreakdown {
  const byTopic = new Map<string, TopicScore>();
  const entry = (name?: string) => {
    const topic = String(name || "").trim() || UNNAMED_TOPIC;
    let score = byTopic.get(topic);
    if (!score) {
      score = { topic, earned: 0, max: 0, percent: 0, mcqRight: 0, mcqTotal: 0, positionsSolved: 0, positionsTotal: 0 };
      byTopic.set(topic, score);
    }
    return score;
  };
  const answers = new Map((input.mcqAnswers || []).map((answer) => [answer.questionId, answer]));
  const progress = new Map((input.positionProgress || []).map((item) => [item.questionId, item]));

  for (const mcq of input.mcqs || []) {
    const score = entry(mcq.topicName);
    const correct = Boolean(answers.get(mcq.id)?.correct);
    score.max += MCQ_MARKS;
    score.mcqTotal += 1;
    score.earned += mcqMarks(correct);
    if (correct) score.mcqRight += 1;
  }
  for (const position of input.positions || []) {
    const score = entry(position.topicName);
    const done: Partial<ProgressInput> = progress.get(position.id) || {};
    score.max += POSITION_MARKS;
    score.positionsTotal += 1;
    score.earned += positionMarks(done);
    if (done.solved) score.positionsSolved += 1;
  }

  const topics = Array.from(byTopic.values())
    .map((score) => ({ ...score, earned: roundMarks(score.earned), percent: score.max ? Math.round((score.earned / score.max) * 100) : 0 }))
    .sort((a, b) => b.percent - a.percent || b.max - a.max || a.topic.localeCompare(b.topic));
  return {
    topics,
    strong: topics.filter((score) => score.percent >= STRONG_TOPIC_PERCENT).map((score) => score.topic),
    weak: topics.filter((score) => score.percent < WEAK_TOPIC_PERCENT).map((score) => score.topic),
  };
}

/** One line per topic, strongest first: "Checkmates: 9 of 10 marks (90%)". */
export function topicReportLines(breakdown: TopicBreakdown) {
  return breakdown.topics.map((score) => `${score.topic}: ${score.earned} of ${score.max} marks (${score.percent}%)`);
}

/** The solution as it is written in a book: "1. Ra8+ Kd7 2. Rh7+", or "1... Qc5 2. d3" when Black starts. */
export function solutionLine(startFen: string, sans: string[]) {
  const fields = buildGame(startFen).fen().split(/\s+/);
  let white = fields[1] !== "b";
  let number = Number(fields[5]) || 1;
  const parts: string[] = [];
  sans.forEach((san, index) => {
    if (white) parts.push(`${number}. ${san}`);
    else parts.push(index === 0 ? `${number}... ${san}` : san);
    if (!white) number += 1;
    white = !white;
  });
  return parts.join(" ");
}

/* ------------------------------------------------------------- the student's result */

export type ReviewMcqInput = {
  id: string;
  topicName?: string;
  question: string;
  positionFen?: string;
  options: { id: string; text: string; correct?: boolean }[];
  explanation?: string;
};
export type ReviewPositionInput = {
  id: string;
  topicName?: string;
  question: string;
  startFen: string;
  orientation: "white" | "black";
  solution: string[];
};

export type ExamResult = {
  mcqs: {
    id: string;
    topicName: string;
    answered: boolean;
    correct: boolean;
    marks: number;
    /** Only for a question answered wrong or left unanswered. */
    review?: { question: string; positionFen: string; options: { id: string; text: string }[]; selected: string | null; correctOptionId: string; explanation: string };
  }[];
  positions: {
    id: string;
    topicName: string;
    solved: boolean;
    wrongMoves: number;
    hintsUsed: number;
    marks: number;
    /** Only for a position left unsolved. */
    review?: { question: string; startFen: string; orientation: "white" | "black"; solution: string };
  }[];
} & TopicBreakdown;

/** The result a student sees once the exam is submitted, with the answers to what they missed. */
export function examResult(input: {
  mcqs: ReviewMcqInput[];
  positions: ReviewPositionInput[];
  mcqAnswers: (AnswerInput & { selected?: string | null })[];
  positionProgress: ProgressInput[];
}): ExamResult {
  const answers = new Map(input.mcqAnswers.map((answer) => [answer.questionId, answer]));
  const progress = new Map(input.positionProgress.map((item) => [item.questionId, item]));
  return {
    mcqs: input.mcqs.map((mcq) => {
      const answer = answers.get(mcq.id);
      const correct = Boolean(answer?.correct);
      const right = mcq.options.find((option) => option.correct);
      return {
        id: mcq.id,
        topicName: mcq.topicName || "",
        answered: Boolean(answer),
        correct,
        marks: answer ? mcqMarks(correct) : 0,
        ...(correct || !right
          ? {}
          : {
              review: {
                question: mcq.question,
                positionFen: mcq.positionFen || "",
                options: mcq.options.map((option) => ({ id: option.id, text: option.text })),
                selected: answer?.selected || null,
                correctOptionId: right.id,
                explanation: mcq.explanation || "",
              },
            }),
      };
    }),
    positions: input.positions.map((position) => {
      const done: Partial<ProgressInput> = progress.get(position.id) || {};
      return {
        id: position.id,
        topicName: position.topicName || "",
        solved: Boolean(done.solved),
        wrongMoves: Number(done.wrongMoves || 0),
        hintsUsed: Number(done.hintsUsed || 0),
        marks: positionMarks(done),
        ...(done.solved || !position.solution.length
          ? {}
          : {
              review: {
                question: position.question,
                startFen: position.startFen,
                orientation: position.orientation,
                solution: solutionLine(position.startFen, position.solution),
              },
            }),
      };
    }),
    ...topicBreakdown(input),
  };
}
