import "server-only";

import { dbConnect } from "@/lib/db";
import { ensureLearningSeedData } from "@/lib/learning/content";
import {
  applyChoice,
  applyMove,
  applySquareSelection,
  buildDemoTimeline,
  correctSquares,
  createSession,
  informationDemoMoves,
  informationKeyPoints,
  normalizeMoveToken,
  verifyLearningSolution,
  type LearningExerciseSpec,
} from "@/lib/learning/engine";
import { LearningAttempt, LearningExercise, LearningExerciseProgress, LearningLesson, LearningSection } from "@/models/Learning";
import { User } from "@/models/User";

/** Server-side helpers for the coach and admin Learn Chess screens. */

export type AuthoringExercise = {
  id: string;
  stableKey: string;
  lessonId: string;
  lessonSlug: string;
  lessonName: string;
  sectionName: string;
  title: string;
  description: string;
  order: number;
  status: "draft" | "published" | "archived";
  rulesMode: string;
  interactionMode: string;
  startingPosition: string;
  orientation: "white" | "black";
  sideToMove: "white" | "black";
  goalType: string;
  goalConfig: Record<string, any>;
  acceptedSolutions: Array<{ moves: string[] }>;
  opponentScript: Array<{ actor: "student" | "opponent"; move?: string; acceptedMoves: string[] }>;
  targets: string[];
  obstacles: string[];
  hints: Array<{ text?: string; showAfterErrors?: number }>;
  maxMoves: number;
  idealMoves: number;
  explanation: string;
  successMessage: string;
  failureMessage: string;
  difficulty: 1 | 2 | 3;
  version: number;
  createdBy: string;
  updatedAt?: string;
};

export type AuthoringLesson = {
  id: string;
  stableKey: string;
  name: string;
  slug: string;
  sectionName: string;
  sectionOrder: number;
  order: number;
  status: string;
  exerciseCount: number;
  publishedCount: number;
};

function toId(value: any) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function serializeExercise(exercise: any, lesson: any, section: any): AuthoringExercise {
  return {
    id: toId(exercise._id),
    stableKey: String(exercise.stableKey),
    lessonId: toId(exercise.lessonId),
    lessonSlug: String(lesson?.slug || ""),
    lessonName: String(lesson?.name || ""),
    sectionName: String(section?.name || ""),
    title: String(exercise.title || ""),
    description: String(exercise.description || ""),
    order: Number(exercise.order || 0),
    status: (exercise.status || "draft") as AuthoringExercise["status"],
    rulesMode: String(exercise.rulesMode || "LEGAL_CHESS"),
    interactionMode: String(exercise.interactionMode || "BOARD_MOVE"),
    startingPosition: String(exercise.startingPosition || "start"),
    orientation: exercise.orientation === "black" ? "black" : "white",
    sideToMove: exercise.sideToMove === "black" ? "black" : "white",
    goalType: String(exercise.goalType || ""),
    goalConfig: (exercise.goalConfig || {}) as Record<string, any>,
    acceptedSolutions: Array.isArray(exercise.acceptedSolutions)
      ? exercise.acceptedSolutions.map((solution: any) => ({
          moves: Array.isArray(solution?.moves) ? solution.moves.map(String) : [],
        }))
      : [],
    opponentScript: Array.isArray(exercise.opponentScript)
      ? exercise.opponentScript.map((step: any) => ({
          actor: step?.actor === "opponent" ? ("opponent" as const) : ("student" as const),
          move: step?.move ? String(step.move) : undefined,
          acceptedMoves: Array.isArray(step?.acceptedMoves) ? step.acceptedMoves.map(String) : [],
        }))
      : [],
    targets: Array.isArray(exercise.targets) ? exercise.targets.map(String) : [],
    obstacles: Array.isArray(exercise.obstacles) ? exercise.obstacles.map(String) : [],
    hints: Array.isArray(exercise.hints)
      ? exercise.hints.map((hint: any) => ({ text: hint?.text ? String(hint.text) : "", showAfterErrors: Number(hint?.showAfterErrors || 0) }))
      : [],
    maxMoves: Number(exercise.maxMoves || 0),
    idealMoves: Number(exercise.idealMoves || 1),
    explanation: String(exercise.explanation || ""),
    successMessage: String(exercise.successMessage || ""),
    failureMessage: String(exercise.failureMessage || ""),
    difficulty: (Number(exercise.difficulty || 1) || 1) as 1 | 2 | 3,
    version: Number(exercise.version || 1),
    createdBy: String(exercise.createdBy || ""),
    updatedAt: exercise.updatedAt ? new Date(exercise.updatedAt).toISOString() : undefined,
  };
}

export function specFromExercise(exercise: {
  rulesMode: string;
  interactionMode: string;
  goalType: string;
  startingPosition: string;
  orientation?: string;
  sideToMove?: string;
  goalConfig?: Record<string, any>;
  acceptedSolutions?: Array<{ moves: string[] }>;
  opponentScript?: Array<{ actor: string; move?: string; acceptedMoves?: string[] }>;
  targets?: string[];
  obstacles?: string[];
  maxMoves?: number;
  idealMoves?: number;
}): LearningExerciseSpec {
  return {
    rulesMode: exercise.rulesMode as LearningExerciseSpec["rulesMode"],
    interactionMode: exercise.interactionMode as LearningExerciseSpec["interactionMode"],
    goalType: exercise.goalType,
    startingPosition: exercise.startingPosition,
    orientation: exercise.orientation === "black" ? "black" : "white",
    sideToMove: exercise.sideToMove === "black" ? "black" : "white",
    goalConfig: exercise.goalConfig || {},
    acceptedSolutions: exercise.acceptedSolutions || [],
    opponentScript: (exercise.opponentScript || []).map((step) => ({
      actor: step.actor === "opponent" ? ("opponent" as const) : ("student" as const),
      move: step.move,
      acceptedMoves: step.acceptedMoves || [],
    })),
    targets: exercise.targets || [],
    obstacles: exercise.obstacles || [],
    maxMoves: exercise.maxMoves || 0,
    idealMoves: exercise.idealMoves || 1,
  };
}

export type ValidationReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** The move list the validator proved works, so the author can see it. */
  provenLine: string[];
};

/**
 * Runs a draft exercise through the student engine before it is saved.
 * This is the whole point of the authoring screen: a coach cannot publish a
 * position that nobody can solve.
 */
export function validateExerciseDraft(draft: Parameters<typeof specFromExercise>[0] & { goalConfig?: Record<string, any> }): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const spec = specFromExercise(draft);

  if (!spec.startingPosition?.trim()) errors.push("A starting position is required.");
  if (!spec.goalType) errors.push("A goal type is required.");

  if (spec.interactionMode === "INFORMATION") {
    const points = informationKeyPoints(spec);
    const demoMoves = informationDemoMoves(spec);
    if (!points.length) errors.push("A slide needs at least one teaching point.");
    if (points.length < 3) warnings.push("Most slides read better with three or four points.");

    if (demoMoves.length) {
      const timeline = buildDemoTimeline(spec);
      if (timeline.error) errors.push(`The worked example stops: ${timeline.error}`);
      // A legal-chess demo is a real game, so the moves have to alternate colours.
      if (!timeline.error && spec.rulesMode === "LEGAL_CHESS" && demoMoves.length > 1) {
        warnings.push("Remember the example alternates sides: white, black, white.");
      }
    }
    return { ok: !errors.length, errors, warnings, provenLine: demoMoves };
  }

  if (spec.rulesMode === "QUESTION" || spec.interactionMode === "MULTIPLE_CHOICE") {
    const options = Array.isArray(spec.goalConfig?.options) ? (spec.goalConfig!.options as string[]) : [];
    const correct = String(spec.goalConfig?.correctOption || "");
    if (options.length < 2) errors.push("A multiple-choice question needs at least two options.");
    if (!correct) errors.push("Set which option is correct.");
    else if (!options.includes(correct)) errors.push("The correct answer is not one of the options.");
    if (new Set(options).size !== options.length) warnings.push("Two options are identical.");
    if (!errors.length) {
      const solved = applyChoice(spec, createSession(spec), correct).solved;
      if (!solved) errors.push("The engine did not accept the correct option.");
      return { ok: !errors.length, errors, warnings, provenLine: [] };
    }
    return { ok: false, errors, warnings, provenLine: [] };
  }

  if (spec.interactionMode === "SELECT_SQUARE") {
    const wanted = correctSquares(spec);
    if (!wanted.length) errors.push("Set at least one correct square.");
    if (!errors.length) {
      let state = createSession(spec);
      let solved = false;
      for (const square of wanted) {
        const outcome = applySquareSelection(spec, state, square);
        if (!outcome.ok) {
          errors.push(`The engine rejected ${square}.`);
          break;
        }
        state = outcome.state;
        solved = outcome.solved;
      }
      if (!solved && !errors.length) errors.push("Selecting every listed square did not solve the exercise.");
    }
    return { ok: !errors.length, errors, warnings, provenLine: wanted };
  }

  const scripted = spec.interactionMode === "BOARD_SEQUENCE" && (spec.opponentScript || []).length > 0;
  const line = scripted
    ? (spec.opponentScript || []).filter((step) => step.actor === "student").map((step) => (step.acceptedMoves || [])[0] || "")
    : (spec.acceptedSolutions || [])[0]?.moves || [];

  if (!line.length) {
    errors.push("Add a model solution so the exercise can be checked.");
    return { ok: false, errors, warnings, provenLine: [] };
  }

  let state = createSession(spec);
  let solved = false;
  const played: string[] = [];
  for (const raw of line) {
    const move = normalizeMoveToken(String(raw));
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
      errors.push(`"${raw}" is not a move in the form e2e4.`);
      break;
    }
    const outcome = applyMove(spec, state, move.slice(0, 2), move.slice(2, 4), move.slice(4) || undefined);
    if (!outcome.ok) {
      errors.push(`The engine rejected ${move}: ${outcome.reason || "illegal move"}`);
      break;
    }
    played.push(move);
    state = outcome.state;
    if (outcome.solved) {
      solved = true;
      break;
    }
  }

  if (!solved && !errors.length) errors.push("The model solution does not complete the goal.");
  if (spec.maxMoves && spec.maxMoves < line.length) {
    errors.push(`The move limit (${spec.maxMoves}) is smaller than the model solution (${line.length} moves).`);
  }
  if (solved && !verifyLearningSolution(spec, { moves: played }).solved) {
    errors.push("Server-side replay disagrees with the board. Do not publish this exercise.");
  }

  return { ok: !errors.length, errors, warnings, provenLine: played };
}

export async function getAuthoringCatalog() {
  await dbConnect();
  await ensureLearningSeedData();

  const [sections, lessons, exercises] = await Promise.all([
    LearningSection.find({}).sort({ order: 1 }).lean(),
    LearningLesson.find({}).sort({ order: 1 }).lean(),
    LearningExercise.find({ status: { $ne: "archived" } }).sort({ order: 1 }).lean(),
  ]);

  const sectionById = new Map(sections.map((section: any) => [toId(section._id), section]));
  const lessonById = new Map(lessons.map((lesson: any) => [toId(lesson._id), lesson]));

  const lessonSummaries: AuthoringLesson[] = lessons
    .map((lesson: any) => {
      const section: any = sectionById.get(toId(lesson.sectionId));
      const own = exercises.filter((exercise: any) => toId(exercise.lessonId) === toId(lesson._id));
      return {
        id: toId(lesson._id),
        stableKey: String(lesson.stableKey),
        name: String(lesson.name),
        slug: String(lesson.slug),
        sectionName: String(section?.name || ""),
        sectionOrder: Number(section?.order || 0),
        order: Number(lesson.order || 0),
        status: String(lesson.status || "draft"),
        exerciseCount: own.length,
        publishedCount: own.filter((exercise: any) => exercise.status === "published").length,
      };
    })
    .sort((a, b) => a.sectionOrder - b.sectionOrder || a.order - b.order);

  const exerciseSummaries = exercises
    .map((exercise: any) => {
      const lesson: any = lessonById.get(toId(exercise.lessonId));
      const section: any = lesson ? sectionById.get(toId(lesson.sectionId)) : undefined;
      return serializeExercise(exercise, lesson, section);
    })
    .sort((a, b) => a.lessonName.localeCompare(b.lessonName) || a.order - b.order);

  return { lessons: lessonSummaries, exercises: exerciseSummaries };
}

export async function getExerciseById(id: string) {
  await dbConnect();
  const exercise: any = await LearningExercise.findById(id).lean();
  if (!exercise) return null;
  const lesson: any = await LearningLesson.findById(exercise.lessonId).lean();
  const section: any = lesson ? await LearningSection.findById(lesson.sectionId).lean() : null;
  return serializeExercise(exercise, lesson, section);
}

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ */

export type LearningAnalytics = {
  totals: {
    publishedExercises: number;
    studentsStarted: number;
    studentsCompletedAll: number;
    attempts: number;
    completions: number;
    completionRate: number;
    averageStars: number;
  };
  starDistribution: Array<{ stars: number; count: number }>;
  lessons: Array<{
    lessonId: string;
    lessonName: string;
    sectionName: string;
    exercises: number;
    students: number;
    attempts: number;
    completions: number;
    completionRate: number;
    averageStars: number;
    averageIncorrectMoves: number;
  }>;
  hardestExercises: Array<{
    exerciseId: string;
    stableKey: string;
    title: string;
    lessonName: string;
    students: number;
    attempts: number;
    completions: number;
    completionRate: number;
    averageIncorrectMoves: number;
    averageHints: number;
  }>;
  recentActivity: Array<{
    studentName: string;
    exerciseTitle: string;
    lessonName: string;
    completed: boolean;
    stars: number;
    at: string;
  }>;
};

function rate(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function average(total: number, count: number) {
  return count > 0 ? Math.round((total / count) * 10) / 10 : 0;
}

export async function getLearningAnalytics(): Promise<LearningAnalytics> {
  await dbConnect();
  await ensureLearningSeedData();

  const [sections, lessons, exercises, progressRows, starRows, recentRows] = await Promise.all([
    LearningSection.find({}).lean(),
    LearningLesson.find({}).lean(),
    LearningExercise.find({ status: "published" }).select("_id lessonId stableKey title").lean(),
    LearningExerciseProgress.aggregate([
      {
        $group: {
          _id: "$exerciseId",
          students: { $sum: 1 },
          attempts: { $sum: { $ifNull: ["$attemptCount", 0] } },
          completions: { $sum: { $cond: ["$completed", 1, 0] } },
          stars: { $sum: { $ifNull: ["$bestStars", 0] } },
          incorrect: { $sum: { $ifNull: ["$totalIncorrectMoves", 0] } },
          hints: { $sum: { $ifNull: ["$totalHintsUsed", 0] } },
        },
      },
    ]),
    LearningExerciseProgress.aggregate([
      { $match: { completed: true } },
      { $group: { _id: "$bestStars", count: { $sum: 1 } } },
    ]),
    LearningAttempt.find({}).sort({ createdAt: -1 }).limit(25).lean(),
  ]);

  const sectionById = new Map(sections.map((section: any) => [toId(section._id), section]));
  const lessonById = new Map(lessons.map((lesson: any) => [toId(lesson._id), lesson]));
  const exerciseById = new Map(exercises.map((exercise: any) => [toId(exercise._id), exercise]));
  const statsByExercise = new Map(progressRows.map((row: any) => [toId(row._id), row]));

  const distinctStudents = await LearningExerciseProgress.distinct("studentId");
  const publishedExercises = exercises.length;

  let attempts = 0;
  let completions = 0;
  let starTotal = 0;

  const lessonBuckets = new Map<
    string,
    { exercises: number; students: number; attempts: number; completions: number; stars: number; incorrect: number }
  >();

  const perExercise = exercises.map((exercise: any) => {
    const id = toId(exercise._id);
    const stats: any = statsByExercise.get(id) || { students: 0, attempts: 0, completions: 0, stars: 0, incorrect: 0, hints: 0 };
    const lesson: any = lessonById.get(toId(exercise.lessonId));
    const lessonKey = toId(exercise.lessonId);

    attempts += stats.attempts;
    completions += stats.completions;
    starTotal += stats.stars;

    const bucket = lessonBuckets.get(lessonKey) || { exercises: 0, students: 0, attempts: 0, completions: 0, stars: 0, incorrect: 0 };
    bucket.exercises += 1;
    bucket.students += stats.students;
    bucket.attempts += stats.attempts;
    bucket.completions += stats.completions;
    bucket.stars += stats.stars;
    bucket.incorrect += stats.incorrect;
    lessonBuckets.set(lessonKey, bucket);

    return {
      exerciseId: id,
      stableKey: String(exercise.stableKey),
      title: String(exercise.title),
      lessonName: String(lesson?.name || ""),
      students: stats.students,
      attempts: stats.attempts,
      completions: stats.completions,
      completionRate: rate(stats.completions, stats.students),
      averageIncorrectMoves: average(stats.incorrect, stats.students),
      averageHints: average(stats.hints, stats.students),
    };
  });

  const lessonAnalytics = Array.from(lessonBuckets.entries())
    .map(([lessonId, bucket]) => {
      const lesson: any = lessonById.get(lessonId);
      const section: any = lesson ? sectionById.get(toId(lesson.sectionId)) : undefined;
      return {
        lessonId,
        lessonName: String(lesson?.name || ""),
        sectionName: String(section?.name || ""),
        exercises: bucket.exercises,
        students: bucket.students,
        attempts: bucket.attempts,
        completions: bucket.completions,
        completionRate: rate(bucket.completions, bucket.students),
        averageStars: average(bucket.stars, bucket.completions),
        averageIncorrectMoves: average(bucket.incorrect, bucket.students),
      };
    })
    .sort((a, b) => a.completionRate - b.completionRate);

  // "Hardest" only means something once a few students have tried it.
  const hardestExercises = perExercise
    .filter((row) => row.students >= 3)
    .sort((a, b) => a.completionRate - b.completionRate || b.averageIncorrectMoves - a.averageIncorrectMoves)
    .slice(0, 10);

  const studentIds = Array.from(new Set(recentRows.map((row: any) => toId(row.studentId)))).filter(Boolean);
  const students = studentIds.length ? await User.find({ _id: { $in: studentIds } }).select("_id name").lean() : [];
  const studentNameById = new Map(students.map((student: any) => [toId(student._id), String(student.name || "Student")]));

  const recentActivity = recentRows.map((row: any) => {
    const exercise: any = exerciseById.get(toId(row.exerciseId));
    const lesson: any = exercise ? lessonById.get(toId(exercise.lessonId)) : undefined;
    return {
      studentName: studentNameById.get(toId(row.studentId)) || "Student",
      exerciseTitle: String(exercise?.title || "Removed exercise"),
      lessonName: String(lesson?.name || ""),
      completed: Boolean(row.completed),
      stars: Number(row.stars || 0),
      at: new Date(row.createdAt || Date.now()).toISOString(),
    };
  });

  const completedPerStudent = await LearningExerciseProgress.aggregate([
    { $match: { completed: true } },
    { $group: { _id: "$studentId", done: { $sum: 1 } } },
    { $match: { done: { $gte: publishedExercises || 1 } } },
    { $count: "students" },
  ]);

  return {
    totals: {
      publishedExercises,
      studentsStarted: distinctStudents.length,
      studentsCompletedAll: Number(completedPerStudent[0]?.students || 0),
      attempts,
      completions,
      completionRate: rate(completions, distinctStudents.length * publishedExercises || 0),
      averageStars: average(starTotal, completions),
    },
    starDistribution: [1, 2, 3].map((stars) => ({
      stars,
      count: Number(starRows.find((row: any) => Number(row._id) === stars)?.count || 0),
    })),
    lessons: lessonAnalytics,
    hardestExercises,
    recentActivity,
  };
}
