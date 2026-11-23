"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, CircleHelp, X } from "lucide-react";
import type { QuizBlock } from "@/lib/blog/types";

/**
 * A short multiple-choice quiz. Explanations arrive pre-rendered from the
 * server (they carry inline links), so this file stays free of the blog's
 * markup parser. Every answer and explanation is in the HTML from the start,
 * hidden until picked, so search engines and screen readers still get them.
 */
export default function Quiz({ block, explanations }: { block: QuizBlock; explanations: ReactNode[] }) {
  const id = useId();
  const [picked, setPicked] = useState<(number | null)[]>(() => block.questions.map(() => null));
  const answered = picked.filter((choice) => choice !== null).length;
  const correct = picked.filter((choice, index) => choice === block.questions[index]?.answer).length;

  return (
    <section aria-labelledby={`${id}-title`} className="mt-8 rounded-2xl border-2 border-accent/70 bg-accent/10 p-5 sm:p-6">
      <p id={`${id}-title`} className="flex items-center gap-2 text-lg font-black leading-snug text-brand-900">
        <CircleHelp size={19} className="text-brand" /> {block.heading}
      </p>
      <ol className="mt-4 space-y-5">
        {block.questions.map((question, qIndex) => {
          const choice = picked[qIndex];
          const done = choice !== null;
          return (
            <li key={question.q}>
              <p className="font-black leading-6 text-brand-900">{qIndex + 1}. {question.q}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {question.options.map((option, oIndex) => {
                  const isAnswer = oIndex === question.answer;
                  const isPicked = oIndex === choice;
                  const tone = !done
                    ? "border-brand/20 bg-white hover:border-brand"
                    : isAnswer
                      ? "border-emerald-600 bg-emerald-50"
                      : isPicked
                        ? "border-rose-500 bg-rose-50"
                        : "border-brand/10 bg-white opacity-60";
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={done}
                      onClick={() => setPicked((current) => current.map((value, index) => (index === qIndex ? oIndex : value)))}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-bold leading-5 text-brand-900 transition disabled:cursor-default ${tone}`}
                    >
                      {option}
                      {done && isAnswer ? <Check size={16} className="flex-none text-emerald-700" aria-label="correct answer" /> : null}
                      {done && isPicked && !isAnswer ? <X size={16} className="flex-none text-rose-600" aria-label="your answer" /> : null}
                    </button>
                  );
                })}
              </div>
              <p className={`mt-2 text-sm leading-6 text-brand-900/75 ${done ? "" : "sr-only"}`} aria-live="polite">
                {explanations[qIndex]}
              </p>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm font-black text-brand-900">
        <span aria-live="polite">
          {answered === block.questions.length ? `You scored ${correct} out of ${block.questions.length}.` : `${answered} of ${block.questions.length} answered`}
        </span>
        {answered ? (
          <button type="button" onClick={() => setPicked(block.questions.map(() => null))} className="rounded-full border border-brand/25 bg-white px-3.5 py-1.5 text-xs font-extrabold hover:border-brand">
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}
