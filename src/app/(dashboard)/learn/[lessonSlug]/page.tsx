import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/common/PageHeader";
import { getLearningLessonDetail } from "@/lib/learning/service";

export const dynamic = "force-dynamic";

function difficultyStars(value: number) {
  return "★".repeat(Math.max(1, Math.min(3, value)));
}

export default async function LearnLessonPage({ params }: { params: { lessonSlug: string } }) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const detail = await getLearningLessonDetail(params.lessonSlug, userId);
  if (!detail) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={detail.lesson.sectionTitle}
        title={detail.lesson.title}
        subtitle={detail.lesson.introContent || detail.lesson.description}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Progress</div>
            <div className="mt-1 text-xl font-black text-slate-950">{detail.lesson.completedExercises} / {detail.lesson.totalExercises}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Stars</div>
            <div className="mt-1 text-xl font-black text-slate-950">{detail.lesson.earnedStars} / {detail.lesson.totalStars}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Status</div>
            <div className="mt-1 text-xl font-black text-slate-950">{detail.lesson.isComplete ? "Complete" : detail.lesson.isLocked ? "Locked" : "In Progress"}</div>
          </div>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/learn" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
          <ChevronLeft size={16} aria-hidden="true" />
          Back to curriculum
        </Link>
        <div className="flex flex-wrap gap-2">
          {detail.previousLesson ? (
            <Link href={`/learn/${detail.previousLesson.slug}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              <ChevronLeft size={16} aria-hidden="true" />
              {detail.previousLesson.title}
            </Link>
          ) : null}
          {detail.nextLesson ? (
            <Link href={`/learn/${detail.nextLesson.slug}`} className="inline-flex items-center gap-2 rounded-xl border border-brand/20 bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
              {detail.nextLesson.title}
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      {detail.exercises.length === 0 ? (
        <EmptyState title="This lesson does not have published exercises yet." description="Add published exercises to make this lesson available to students." />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand/5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {detail.exercises.map((exercise) => (
              <Link
                key={exercise.id}
                href={exercise.isLocked ? "#" : `/learn/${params.lessonSlug}/${exercise.stableKey}`}
                aria-disabled={exercise.isLocked}
                className={`rounded-2xl border p-4 ${
                  exercise.isLocked ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-white text-slate-900"
                } ${exercise.isLocked ? "cursor-not-allowed" : "transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md hover:shadow-brand/10"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Exercise {exercise.order}</div>
                    <h2 className="mt-1 text-base font-black text-inherit">{exercise.title}</h2>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${exercise.completed ? "bg-emerald-50 text-emerald-700" : exercise.isLocked ? "bg-slate-200 text-slate-500" : "bg-brand-50 text-brand"}`}>
                    {exercise.completed ? "Complete" : exercise.isLocked ? "Locked" : "Open"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-600">{difficultyStars(exercise.difficulty)}</span>
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <Star size={14} aria-hidden="true" />
                    {exercise.bestStars} / 3
                  </span>
                </div>
                {exercise.isLocked ? (
                  <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Lock size={14} aria-hidden="true" />
                    Finish the previous exercise to unlock this one.
                  </div>
                ) : (
                  <div className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-brand">{exercise.completed ? "Practice again" : "Start exercise"} <ChevronRight size={14} className="ml-1 inline" /></div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
