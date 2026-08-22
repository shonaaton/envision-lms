import "server-only";

import { dbConnect } from "@/lib/db";
import { ensureLearningSeedData } from "@/lib/learning/content";
import { LearningExercise, LearningExerciseProgress, LearningLesson, LearningSection } from "@/models/Learning";

type LessonExerciseSummary = {
  id: string;
  stableKey: string;
  title: string;
  order: number;
  difficulty: 1 | 2 | 3;
  completed: boolean;
  bestStars: number;
  isLocked: boolean;
  nextExerciseStableKey?: string;
};

type LessonSummary = {
  id: string;
  stableKey: string;
  sectionStableKey: string;
  title: string;
  slug: string;
  description: string;
  icon?: string;
  order: number;
  totalExercises: number;
  completedExercises: number;
  earnedStars: number;
  totalStars: number;
  progressPercent: number;
  isComplete: boolean;
  isLocked: boolean;
  nextExerciseStableKey?: string;
};

type SectionSummary = {
  id: string;
  stableKey: string;
  title: string;
  slug: string;
  description: string;
  order: number;
  totalExercises: number;
  completedExercises: number;
  earnedStars: number;
  totalStars: number;
  progressPercent: number;
  isComplete: boolean;
  lessons: LessonSummary[];
};

export type LearningCatalog = {
  sections: SectionSummary[];
  totals: {
    totalExercises: number;
    completedExercises: number;
    earnedStars: number;
    totalStars: number;
    overallProgressPercent: number;
  };
  continueLesson?: {
    lessonSlug: string;
    lessonTitle: string;
    sectionTitle: string;
    completedExercises: number;
    totalExercises: number;
  };
};

export type LearningLessonDetail = {
  lesson: LessonSummary & {
    introContent?: string;
    sectionTitle: string;
    sectionSlug: string;
  };
  exercises: LessonExerciseSummary[];
  previousLesson?: { slug: string; title: string };
  nextLesson?: { slug: string; title: string };
};

export type LearningExerciseDetail = {
  id: string;
  stableKey: string;
  title: string;
  description: string;
  lessonSlug: string;
  lessonTitle: string;
  sectionTitle: string;
  interactionMode: string;
  rulesMode: string;
  startingPosition: string;
  orientation: "white" | "black";
  sideToMove?: "white" | "black";
  goalType: string;
  goalConfig: Record<string, any>;
  hints: Array<{ text?: string; showAfterErrors?: number }>;
  explanation: string;
  successMessage: string;
  failureMessage: string;
  difficulty: 1 | 2 | 3;
  completed: boolean;
  bestStars: number;
  isLocked: boolean;
  nextExerciseStableKey?: string;
};

function toId(value: any) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function percent(completed: number, total: number) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

async function loadLearningSnapshot(userId?: string) {
  await dbConnect();
  await ensureLearningSeedData();

  const [sections, lessons, exercises, progress] = await Promise.all([
    LearningSection.find({ status: "published" }).sort({ order: 1 }).lean(),
    LearningLesson.find({ status: "published" }).sort({ order: 1 }).lean(),
    LearningExercise.find({ status: "published" })
      .select("_id lessonId stableKey title description order difficulty interactionMode rulesMode startingPosition orientation sideToMove goalType goalConfig hints explanation successMessage failureMessage")
      .sort({ order: 1 })
      .lean(),
    userId
      ? LearningExerciseProgress.find({ studentId: userId })
          .select("exerciseId completed bestStars lastAttemptedAt")
          .lean()
      : Promise.resolve([]),
  ]);

  return { sections, lessons, exercises, progress };
}

export async function getLearningExerciseDetail(
  lessonSlug: string,
  stableKey: string,
  userId?: string
): Promise<LearningExerciseDetail | null> {
  const { sections, lessons, exercises, progress } = await loadLearningSnapshot(userId);
  const lesson = lessons.find((item: any) => String(item.slug) === lessonSlug);
  if (!lesson) return null;
  const lessonExercises = exercises
    .filter((item: any) => toId(item.lessonId) === toId(lesson._id))
    .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));
  const exercise = lessonExercises.find((item: any) => String(item.stableKey) === stableKey);
  if (!exercise) return null;
  const section = sections.find((item: any) => toId(item._id) === toId(lesson.sectionId));
  const progressByExerciseId = new Map(progress.map((item: any) => [toId(item.exerciseId), item]));
  const index = lessonExercises.findIndex((item: any) => toId(item._id) === toId(exercise._id));
  const isLocked = lessonExercises.slice(0, index).some((item: any) => !progressByExerciseId.get(toId(item._id))?.completed);
  const progressItem: any = progressByExerciseId.get(toId(exercise._id));

  return {
    id: toId(exercise._id),
    stableKey: String(exercise.stableKey),
    title: String(exercise.title),
    description: String(exercise.description || "Practice the lesson goal on the board."),
    lessonSlug: String(lesson.slug),
    lessonTitle: String(lesson.name),
    sectionTitle: String(section?.name || "Learn Chess"),
    interactionMode: String(exercise.interactionMode),
    rulesMode: String(exercise.rulesMode),
    startingPosition: String(exercise.startingPosition || "start"),
    orientation: exercise.orientation === "black" ? "black" : "white",
    sideToMove: exercise.sideToMove === "black" ? "black" : "white",
    goalType: String(exercise.goalType || "PRACTICE"),
    goalConfig: (exercise.goalConfig || {}) as Record<string, any>,
    hints: Array.isArray(exercise.hints) ? exercise.hints : [],
    explanation: String(exercise.explanation || "Review the lesson idea and try the move again."),
    successMessage: String(exercise.successMessage || "Nice work. Keep going!"),
    failureMessage: String(exercise.failureMessage || "That move is not the lesson goal yet."),
    difficulty: Number(exercise.difficulty || 1) as 1 | 2 | 3,
    completed: Boolean(progressItem?.completed),
    bestStars: Number(progressItem?.bestStars || 0),
    isLocked,
    nextExerciseStableKey: lessonExercises[index + 1] ? String(lessonExercises[index + 1].stableKey) : undefined,
  };
}

export async function getLearningCatalog(userId?: string): Promise<LearningCatalog> {
  const { sections, lessons, exercises, progress } = await loadLearningSnapshot(userId);
  const progressByExerciseId = new Map(progress.map((item: any) => [toId(item.exerciseId), item]));
  const lessonById = new Map(lessons.map((lesson: any) => [toId(lesson._id), lesson]));
  const lessonsBySectionId = new Map<string, any[]>();
  const exercisesByLessonId = new Map<string, any[]>();

  lessons.forEach((lesson: any) => {
    const key = toId(lesson.sectionId);
    const current = lessonsBySectionId.get(key) || [];
    current.push(lesson);
    lessonsBySectionId.set(key, current);
  });

  exercises.forEach((exercise: any) => {
    const key = toId(exercise.lessonId);
    const current = exercisesByLessonId.get(key) || [];
    current.push(exercise);
    exercisesByLessonId.set(key, current);
  });

  const orderedLessons = lessons
    .map((lesson: any) => {
      const lessonExercises = exercisesByLessonId.get(toId(lesson._id)) || [];
      const completedExercises = lessonExercises.filter((exercise: any) => progressByExerciseId.get(toId(exercise._id))?.completed).length;
      const earnedStars = lessonExercises.reduce((sum: number, exercise: any) => sum + Number(progressByExerciseId.get(toId(exercise._id))?.bestStars || 0), 0);
      const totalExercises = lessonExercises.length;
      const nextExercise = lessonExercises.find((exercise: any) => !progressByExerciseId.get(toId(exercise._id))?.completed) || lessonExercises[0];
      return {
        id: toId(lesson._id),
        stableKey: String(lesson.stableKey),
        sectionStableKey: String(lessonById.get(toId(lesson._id))?.sectionId || lesson.sectionId),
        title: String(lesson.name),
        slug: String(lesson.slug),
        description: String(lesson.description || ""),
        icon: lesson.icon ? String(lesson.icon) : undefined,
        order: Number(lesson.order || 0),
        totalExercises,
        completedExercises,
        earnedStars,
        totalStars: totalExercises * 3,
        progressPercent: percent(completedExercises, totalExercises),
        isComplete: totalExercises > 0 && completedExercises === totalExercises,
        isLocked: false,
        nextExerciseStableKey: nextExercise ? String(nextExercise.stableKey) : undefined,
      } satisfies LessonSummary;
    })
    .sort((a, b) => a.order - b.order);

  let previousLessonComplete = true;
  const lessonsWithLocking = orderedLessons.map((lesson) => {
    const isLocked = !previousLessonComplete;
    previousLessonComplete = previousLessonComplete && lesson.isComplete;
    return { ...lesson, isLocked };
  });

  const lessonSummaryBySlug = new Map(lessonsWithLocking.map((lesson) => [lesson.slug, lesson]));

  const sectionSummaries = sections
    .map((section: any) => {
      const sectionLessons = (lessonsBySectionId.get(toId(section._id)) || [])
        .map((lesson: any) => lessonSummaryBySlug.get(String(lesson.slug)))
        .filter(Boolean) as LessonSummary[];
      const totalExercises = sectionLessons.reduce((sum, lesson) => sum + lesson.totalExercises, 0);
      const completedExercises = sectionLessons.reduce((sum, lesson) => sum + lesson.completedExercises, 0);
      const earnedStars = sectionLessons.reduce((sum, lesson) => sum + lesson.earnedStars, 0);
      return {
        id: toId(section._id),
        stableKey: String(section.stableKey),
        title: String(section.name),
        slug: String(section.slug),
        description: String(section.description || ""),
        order: Number(section.order || 0),
        totalExercises,
        completedExercises,
        earnedStars,
        totalStars: totalExercises * 3,
        progressPercent: percent(completedExercises, totalExercises),
        isComplete: totalExercises > 0 && completedExercises === totalExercises,
        lessons: sectionLessons,
      } satisfies SectionSummary;
    })
    .sort((a, b) => a.order - b.order);

  const totalExercises = sectionSummaries.reduce((sum, section) => sum + section.totalExercises, 0);
  const completedExercises = sectionSummaries.reduce((sum, section) => sum + section.completedExercises, 0);
  const earnedStars = sectionSummaries.reduce((sum, section) => sum + section.earnedStars, 0);
  const continueLesson =
    lessonsWithLocking.find((lesson) => !lesson.isLocked && !lesson.isComplete) || lessonsWithLocking.find((lesson) => !lesson.isLocked);
  const continueSection = continueLesson
    ? sectionSummaries.find((section) => section.lessons.some((lesson) => lesson.slug === continueLesson.slug))
    : undefined;

  return {
    sections: sectionSummaries,
    totals: {
      totalExercises,
      completedExercises,
      earnedStars,
      totalStars: totalExercises * 3,
      overallProgressPercent: percent(completedExercises, totalExercises),
    },
    continueLesson:
      continueLesson && continueSection
        ? {
            lessonSlug: continueLesson.slug,
            lessonTitle: continueLesson.title,
            sectionTitle: continueSection.title,
            completedExercises: continueLesson.completedExercises,
            totalExercises: continueLesson.totalExercises,
          }
        : undefined,
  };
}

export async function getLearningLessonDetail(lessonSlug: string, userId?: string): Promise<LearningLessonDetail | null> {
  const { sections, lessons, exercises, progress } = await loadLearningSnapshot(userId);
  const lesson = lessons.find((item: any) => String(item.slug) === lessonSlug);
  if (!lesson) return null;

  const progressByExerciseId = new Map(progress.map((item: any) => [toId(item.exerciseId), item]));
  const lessonExercises = exercises
    .filter((exercise: any) => toId(exercise.lessonId) === toId(lesson._id))
    .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));
  let unlocked = true;
  const exerciseSummaries = lessonExercises.map((exercise: any) => {
    const exerciseProgress = progressByExerciseId.get(toId(exercise._id));
    const completed = Boolean(exerciseProgress?.completed);
    const summary = {
      id: toId(exercise._id),
      stableKey: String(exercise.stableKey),
      title: String(exercise.title),
      order: Number(exercise.order || 0),
      difficulty: Number(exercise.difficulty || 1) as 1 | 2 | 3,
      completed,
      bestStars: Number(exerciseProgress?.bestStars || 0),
      isLocked: !unlocked,
    };
    if (!completed) unlocked = false;
    return summary;
  });

  const catalog = await getLearningCatalog(userId);
  const currentLessonSummary = catalog.sections.flatMap((section) => section.lessons).find((item) => item.slug === lessonSlug);
  if (!currentLessonSummary) return null;

  const orderedLessons = catalog.sections.flatMap((section) =>
    section.lessons.map((item) => ({
      slug: item.slug,
      title: item.title,
      sectionTitle: section.title,
      sectionSlug: section.slug,
    }))
  );
  const currentIndex = orderedLessons.findIndex((item) => item.slug === lessonSlug);
  const currentSection = sections.find((section: any) => toId(section._id) === toId(lesson.sectionId));

  return {
    lesson: {
      ...currentLessonSummary,
      introContent: String(lesson.introContent || ""),
      sectionTitle: currentSection ? String(currentSection.name) : "Learn Chess",
      sectionSlug: currentSection ? String(currentSection.slug) : "learn",
    },
    exercises: exerciseSummaries,
    previousLesson: currentIndex > 0 ? orderedLessons[currentIndex - 1] : undefined,
    nextLesson: currentIndex >= 0 && currentIndex < orderedLessons.length - 1 ? orderedLessons[currentIndex + 1] : undefined,
  };
}
