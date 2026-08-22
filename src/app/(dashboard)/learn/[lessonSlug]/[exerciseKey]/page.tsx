import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLearningExerciseDetail } from "@/lib/learning/service";
import LearningExercisePlayer from "@/components/learning/LearningExercisePlayer";

export const dynamic = "force-dynamic";

export default async function LearnExercisePage({ params }: { params: { lessonSlug: string; exerciseKey: string } }) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const exercise = await getLearningExerciseDetail(params.lessonSlug, params.exerciseKey, userId);
  if (!exercise) notFound();
  if (exercise.isLocked) redirect(`/learn/${exercise.lessonSlug}`);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/learn/${exercise.lessonSlug}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-brand/30 hover:bg-brand-50 hover:text-brand"><ChevronLeft size={16} /> Back to {exercise.lessonTitle}</Link>
        <div className="hidden items-center gap-2 text-xs font-bold text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Your progress is saved automatically</div>
      </div>
      <LearningExercisePlayer exercise={exercise} />
    </div>
  );
}
