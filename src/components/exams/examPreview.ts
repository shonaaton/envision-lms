import { judgePuzzleMove, puzzleFenAt, puzzleFromLine, type PgnPuzzle } from "@/lib/pgnPuzzle";
import { examResult } from "@/lib/exams/examReport";
import {
  SUBMIT_REASON_LABELS,
  availablePositionMarks,
  examEndsAt,
  positionMarks,
  scoreExam,
  submitReasonFor,
  violationOutcome,
  type SubmitReason,
  type ViolationType,
} from "@/lib/exams/examRules";
import type { Exam, ExamActions } from "./ExamRunner";

/**
 * The admin's "sit the exam yourself" preview. It answers the exam screens'
 * calls from the paper the admin already has open (answers included, so
 * nothing leaks that the admin cannot already see), using the same rules and
 * the same move checker as the server. Nothing is sent anywhere or saved.
 */

export type PreviewPaper = {
  id: string;
  levelLabel: string;
  mcqs: { id: string; question: string; positionFen: string; topicName: string; options: { id: string; text: string; correct: boolean }[] }[];
  positions: { id: string; topicName: string; question: string; startFen: string; solution: string[]; studentColor: "white" | "black" }[];
};

type Progress = { ply: number; wrongMoves: number; hintsUsed: number; hintPly: number; solved: boolean };

class PreviewError extends Error {
  constructor(message: string, public code = "") {
    super(message);
  }
}

export function createPreviewActions(paper: PreviewPaper, backHref: string): ExamActions {
  const puzzles = new Map<string, PgnPuzzle>(paper.positions.map((position) => [position.id, puzzleFromLine(position.startFen, position.solution)]));
  const state = {
    status: "assigned" as "assigned" | "in_progress" | "submitted",
    startedAt: null as Date | null,
    endsAt: null as Date | null,
    submittedAt: null as Date | null,
    submitReason: null as SubmitReason | null,
    violations: [] as { type: ViolationType; at: Date }[],
    answers: new Map<string, { selected: string; correct: boolean }>(),
    progress: new Map<string, Progress>(),
  };
  const availableUntil = new Date(Date.now() + 7 * 24 * 60 * 60_000);

  function progressOf(id: string) {
    let progress = state.progress.get(id);
    if (!progress) {
      progress = { ply: 0, wrongMoves: 0, hintsUsed: 0, hintPly: -1, solved: false };
      state.progress.set(id, progress);
    }
    return progress;
  }

  function finish(reason: SubmitReason) {
    if (state.status !== "in_progress") return;
    state.status = "submitted";
    state.submittedAt = new Date();
    state.submitReason = reason;
  }

  function running() {
    if (state.status !== "in_progress") throw new PreviewError("This preview has ended.", "submitted");
    if (state.endsAt && Date.now() >= state.endsAt.getTime()) {
      finish("time_up");
      throw new PreviewError("Time is up.", "submitted");
    }
  }

  function exam(): Exam {
    const base = {
      id: `preview-${paper.id}`,
      levelLabel: paper.levelLabel,
      status: state.status,
      availableUntil: availableUntil.toISOString(),
      endsAt: state.endsAt?.toISOString() || null,
      serverNow: new Date().toISOString(),
      submittedAt: state.submittedAt?.toISOString() || null,
      submitReason: state.submitReason,
      submitReasonLabel: state.submitReason ? SUBMIT_REASON_LABELS[state.submitReason] : null,
      warnings: state.violations.filter((violation) => violation.type !== "app_closed").length,
      score: null,
      certificate: null,
    } as Exam;
    if (state.status === "in_progress") {
      return {
        ...base,
        mcqs: paper.mcqs.map((mcq) => ({
          id: mcq.id,
          question: mcq.question,
          positionFen: mcq.positionFen,
          topicName: mcq.topicName,
          options: mcq.options.map((option) => ({ id: option.id, text: option.text })),
          selected: state.answers.get(mcq.id)?.selected || null,
        })),
        positions: paper.positions.map((position) => {
          const progress = progressOf(position.id);
          const puzzle = puzzles.get(position.id)!;
          const hint = !progress.solved && progress.hintPly === progress.ply ? puzzle.moves[progress.ply] : null;
          return {
            id: position.id,
            topicName: position.topicName,
            question: position.question,
            fen: puzzleFenAt(puzzle, progress.ply),
            orientation: position.studentColor,
            wrongMoves: progress.wrongMoves,
            hintsUsed: progress.hintsUsed,
            solved: progress.solved,
            available: availablePositionMarks(progress),
            marks: positionMarks(progress),
            hint: hint ? { san: hint.san, from: hint.from, to: hint.to } : null,
          };
        }),
      };
    }
    if (state.status === "submitted") {
      const mcqAnswers = paper.mcqs.map((mcq) => ({ correct: Boolean(state.answers.get(mcq.id)?.correct) }));
      const score = scoreExam({ mcqAnswers, positionProgress: paper.positions.map((position) => progressOf(position.id)) });
      return {
        ...base,
        score,
        result: examResult({
          mcqs: paper.mcqs,
          positions: paper.positions.map((position) => {
            const puzzle = puzzles.get(position.id)!;
            return {
              id: position.id,
              topicName: position.topicName,
              question: position.question,
              startFen: puzzle.start,
              orientation: position.studentColor,
              solution: puzzle.moves.map((move) => move.san),
            };
          }),
          mcqAnswers: Array.from(state.answers.entries()).map(([questionId, answer]) => ({ questionId, ...answer })),
          positionProgress: Array.from(state.progress.entries()).map(([questionId, progress]) => ({ questionId, ...progress })),
        }),
      };
    }
    return base;
  }

  return {
    preview: true,
    backHref,
    async load() {
      return { exam: exam() };
    },
    beacon() {
      // A preview has nobody to tell.
    },
    async call(body) {
      const action = String(body.action || "");
      const questionId = String(body.questionId || "");
      if (action === "start") {
        state.status = "in_progress";
        state.startedAt = new Date();
        state.endsAt = examEndsAt(state.startedAt);
        return { exam: exam() };
      }
      if (action === "heartbeat") {
        if (state.status === "in_progress" && state.endsAt && Date.now() >= state.endsAt.getTime()) finish("time_up");
        return { status: state.status };
      }
      if (action === "submit") {
        if (state.status === "in_progress") finish(state.endsAt && Date.now() >= state.endsAt.getTime() ? "time_up" : "completed");
        return { exam: exam() };
      }
      if (action === "violation") {
        if (state.status !== "in_progress") return { outcome: "none" };
        const type = String(body.type) as ViolationType;
        // Reopening only happens to a real sitting; a preview always starts fresh.
        if (type === "page_reopened") return { outcome: "none" };
        const outcome = violationOutcome(state.violations, type);
        state.violations.push({ type, at: new Date() });
        if (outcome === "submit") finish(submitReasonFor(type));
        return { outcome };
      }
      running();
      if (action === "mcq") {
        if (state.answers.has(questionId)) throw new PreviewError("This question has already been answered.");
        const option = paper.mcqs.find((mcq) => mcq.id === questionId)?.options.find((item) => item.id === String(body.optionId));
        if (!option) throw new PreviewError("Choose one of the options.");
        state.answers.set(questionId, { selected: option.id, correct: option.correct });
        return { questionId, selected: option.id };
      }
      const puzzle = puzzles.get(questionId);
      if (!puzzle) throw new PreviewError("Position not found.");
      const progress = progressOf(questionId);
      if (progress.solved) throw new PreviewError("This position is already solved.");
      if (action === "move") {
        const verdict = judgePuzzleMove(puzzle, progress.ply, { from: String(body.from), to: String(body.to), promotion: body.promotion ? String(body.promotion) : undefined });
        if (!verdict.legal) return { legal: false, fen: puzzleFenAt(puzzle, progress.ply) };
        if (!verdict.correct) {
          progress.wrongMoves += 1;
          return { legal: true, correct: false, fen: puzzleFenAt(puzzle, progress.ply), wrongMoves: progress.wrongMoves, available: availablePositionMarks(progress) };
        }
        progress.ply = verdict.ply;
        progress.solved = verdict.solved;
        return { legal: true, correct: true, fen: verdict.fen, solved: verdict.solved, reply: verdict.reply, available: availablePositionMarks(progress), marks: positionMarks(progress) };
      }
      if (action === "hint") {
        const next = puzzle.moves[progress.ply];
        if (!next) throw new PreviewError("There is no move left to hint.");
        if (progress.hintPly !== progress.ply) {
          progress.hintsUsed += 1;
          progress.hintPly = progress.ply;
        }
        return { hint: { san: next.san, from: next.from, to: next.to }, hintsUsed: progress.hintsUsed, available: availablePositionMarks(progress) };
      }
      throw new PreviewError("Unknown action.");
    },
  };
}
