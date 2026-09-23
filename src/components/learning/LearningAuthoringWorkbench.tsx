"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, Check, CircleCheck, Loader2, Play, Save, Search, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";
import type { AuthoringExercise, AuthoringLesson, ValidationReport } from "@/lib/learning/adminService";

const RULES_MODES = ["MOVEMENT_TRAINER", "LEGAL_CHESS", "QUESTION"];
const INTERACTION_MODES = ["BOARD_MOVE", "BOARD_SEQUENCE", "COLLECT_TARGETS", "MULTIPLE_CHOICE", "SELECT_SQUARE", "INFORMATION"];
const GOAL_TYPES = [
  "REACH_SQUARE",
  "COLLECT_TARGETS",
  "CAPTURE_TARGET",
  "SELECT_CORRECT_SQUARE",
  "GIVE_CHECK",
  "ESCAPE_CHECK",
  "CHECKMATE",
  "CASTLE",
  "PROMOTE",
  "EN_PASSANT",
  "MULTIPLE_CHOICE",
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/10";
const labelClass = "text-[11px] font-black uppercase tracking-[0.14em] text-slate-500";

function squaresToText(value: string[]) {
  return (value || []).join(" ");
}

/** Splits a space or comma separated field into tokens. Used for squares and for moves. */
function splitTokens(value: string) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function movesToText(value: string[]) {
  return (value || []).join(" ");
}

export default function LearningAuthoringWorkbench({
  lessons,
  exercises,
  canPublish,
}: {
  lessons: AuthoringLesson[];
  exercises: AuthoringExercise[];
  canPublish: boolean;
}) {
  const [items, setItems] = useState(exercises);
  const [lessonFilter, setLessonFilter] = useState(lessons[0]?.id || "");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AuthoringExercise | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (lessonFilter && item.lessonId !== lessonFilter) return false;
      if (!needle) return true;
      return `${item.title} ${item.stableKey} ${item.goalType}`.toLowerCase().includes(needle);
    });
  }, [items, lessonFilter, query]);

  function open(exercise: AuthoringExercise) {
    setSelectedId(exercise.id);
    setDraft({ ...exercise });
    setReport(null);
  }

  function patch(changes: Partial<AuthoringExercise>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setReport(null);
  }

  function patchGoalConfig(changes: Record<string, any>) {
    setDraft((current) => (current ? { ...current, goalConfig: { ...current.goalConfig, ...changes } } : current));
    setReport(null);
  }

  async function check() {
    if (!draft) return null;
    setChecking(true);
    try {
      const response = await fetch("/api/admin/learn/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        toast.error("Could not run the check");
        return null;
      }
      const result = await response.json();
      setReport(result.report as ValidationReport);
      if (result.report.ok) toast.success("The engine solved this exercise");
      else toast.error(`${result.report.errors.length} problem(s) found`);
      return result.report as ValidationReport;
    } finally {
      setChecking(false);
    }
  }

  async function save(status: AuthoringExercise["status"]) {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/learn/exercises/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, status }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (result?.report) setReport(result.report as ValidationReport);
        toast.error(result?.error || "Could not save this exercise");
        return;
      }
      setReport((result?.report as ValidationReport) || null);
      const saved = result.exercise as AuthoringExercise;
      setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setDraft({ ...saved });
      toast.success(status === "published" ? "Published" : "Saved as draft");
    } finally {
      setSaving(false);
    }
  }

  const isInformation = draft?.interactionMode === "INFORMATION";
  const isQuestion = !isInformation && (draft?.interactionMode === "MULTIPLE_CHOICE" || draft?.rulesMode === "QUESTION");
  const isSelectSquare = draft?.interactionMode === "SELECT_SQUARE";
  const isSequence = draft?.interactionMode === "BOARD_SEQUENCE";
  const isPuzzle = Boolean(draft) && !isInformation && !isQuestion && !isSelectSquare;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
      <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <label className={labelClass} htmlFor="lesson-filter">
            Lesson
          </label>
          <select id="lesson-filter" className={inputClass} value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}>
            <option value="">Every lesson</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.sectionName} - {lesson.name} ({lesson.publishedCount}/{lesson.exerciseCount})
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Search title, key or goal"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
          {visible.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => open(exercise)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                selectedId === exercise.id ? "border-brand/40 bg-brand-50" : "border-slate-200 bg-white hover:border-brand/25 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold text-slate-900">{exercise.title}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                    exercise.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {exercise.status}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                {exercise.lessonName} - {exercise.goalType} - level {exercise.difficulty}
              </div>
            </button>
          ))}
          {!visible.length ? <p className="px-2 py-6 text-center text-sm text-slate-500">No exercises match.</p> : null}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {!draft ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 text-center">
            <BookIcon />
            <p className="text-sm font-bold text-slate-700">Pick an exercise to edit it.</p>
            <p className="max-w-sm text-sm text-slate-500">
              Changes are checked against the same rules engine students play on, so a broken position cannot be published.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand">{draft.stableKey}</p>
                <h2 className="mt-1 truncate text-xl font-black text-slate-950">{draft.title}</h2>
                <p className="text-xs font-semibold text-slate-500">
                  {draft.sectionName} - {draft.lessonName} - version {draft.version}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={check}
                  disabled={checking}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand/20 px-3.5 py-2 text-sm font-bold text-brand transition hover:bg-brand-50 disabled:opacity-60"
                >
                  {checking ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Check
                </button>
                <button
                  type="button"
                  onClick={() => save("draft")}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <Save size={16} /> Save draft
                </button>
                {canPublish ? (
                  <button
                    type="button"
                    onClick={() => save("published")}
                    disabled={saving}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand/90 disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Publish
                  </button>
                ) : null}
              </div>
            </div>

            {report ? (
              <div
                className={`rounded-2xl border p-4 text-sm ${
                  report.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
                }`}
              >
                <div className="flex items-center gap-2 font-black">
                  {report.ok ? <CircleCheck size={18} /> : <ShieldAlert size={18} />}
                  {report.ok ? "Solvable" : "Cannot be published"}
                </div>
                {report.errors.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {report.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
                {report.warnings.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
                    {report.warnings.map((warning) => (
                      <li key={warning} className="flex items-start gap-1.5">
                        <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {report.ok && report.provenLine.length ? (
                  <p className="mt-2 font-semibold">Proven line: {report.provenLine.join(" ")}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <div className="space-y-2">
                <span className={labelClass}>Board preview</span>
                <div className="rounded-2xl bg-slate-900 p-2">
                  <AssignmentChessboard
                    maxWidth={320}
                    position={draft.startingPosition || "start"}
                    boardOrientation={draft.orientation}
                    arePiecesDraggable={false}
                    coordinatesClassName="text-white/60"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="fen">
                    Starting position (FEN)
                  </label>
                  <input id="fen" className={`${inputClass} mt-1 font-mono text-xs`} value={draft.startingPosition} onChange={(event) => patch({ startingPosition: event.target.value })} />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Movement-trainer positions do not need kings. Legal-chess positions do.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="title">
                    Title
                  </label>
                  <input id="title" className={`${inputClass} mt-1`} value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="description">
                    Task shown to the student
                  </label>
                  <textarea id="description" rows={2} className={`${inputClass} mt-1`} value={draft.description} onChange={(event) => patch({ description: event.target.value })} />
                </div>

                <div>
                  <label className={labelClass} htmlFor="rules">
                    Rules mode
                  </label>
                  <select id="rules" className={`${inputClass} mt-1`} value={draft.rulesMode} onChange={(event) => patch({ rulesMode: event.target.value })}>
                    {RULES_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="interaction">
                    Interaction
                  </label>
                  <select id="interaction" className={`${inputClass} mt-1`} value={draft.interactionMode} onChange={(event) => patch({ interactionMode: event.target.value })}>
                    {INTERACTION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="goal">
                    Goal
                  </label>
                  <select id="goal" className={`${inputClass} mt-1`} value={draft.goalType} onChange={(event) => patch({ goalType: event.target.value })}>
                    {GOAL_TYPES.map((goal) => (
                      <option key={goal} value={goal}>
                        {goal}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="difficulty">
                    Level
                  </label>
                  <select
                    id="difficulty"
                    className={`${inputClass} mt-1`}
                    value={draft.difficulty}
                    onChange={(event) => patch({ difficulty: Number(event.target.value) as 1 | 2 | 3 })}
                  >
                    {[1, 2, 3].map((level) => (
                      <option key={level} value={level}>
                        Level {level}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="side">
                    Side to move
                  </label>
                  <select id="side" className={`${inputClass} mt-1`} value={draft.sideToMove} onChange={(event) => patch({ sideToMove: event.target.value as "white" | "black" })}>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="orientation">
                    Board orientation
                  </label>
                  <select id="orientation" className={`${inputClass} mt-1`} value={draft.orientation} onChange={(event) => patch({ orientation: event.target.value as "white" | "black" })}>
                    <option value="white">White at the bottom</option>
                    <option value="black">Black at the bottom</option>
                  </select>
                </div>

                {isQuestion ? (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="prompt">
                        Question
                      </label>
                      <input id="prompt" className={`${inputClass} mt-1`} value={String(draft.goalConfig.prompt || "")} onChange={(event) => patchGoalConfig({ prompt: event.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="options">
                        Options (one per line)
                      </label>
                      <textarea
                        id="options"
                        rows={4}
                        className={`${inputClass} mt-1`}
                        value={(draft.goalConfig.options || []).join("\n")}
                        onChange={(event) => patchGoalConfig({ options: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="correct-option">
                        Correct option (must match one line above exactly)
                      </label>
                      <input
                        id="correct-option"
                        className={`${inputClass} mt-1`}
                        value={String(draft.goalConfig.correctOption || "")}
                        onChange={(event) => patchGoalConfig({ correctOption: event.target.value })}
                      />
                    </div>
                  </>
                ) : null}

                {isSelectSquare ? (
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="correct-squares">
                      Correct squares (every one must be clicked)
                    </label>
                    <input
                      id="correct-squares"
                      className={`${inputClass} mt-1 font-mono`}
                      placeholder="b3 c2"
                      value={squaresToText(draft.goalConfig.correctSquares || [])}
                      onChange={(event) => patchGoalConfig({ correctSquares: splitTokens(event.target.value) })}
                    />
                  </div>
                ) : null}

                {isPuzzle ? (
                  <>
                    <div>
                      <label className={labelClass} htmlFor="target-square">
                        Target square
                      </label>
                      <input
                        id="target-square"
                        className={`${inputClass} mt-1 font-mono`}
                        placeholder="e4"
                        value={String(draft.goalConfig.targetSquare || "")}
                        onChange={(event) => patchGoalConfig({ targetSquare: event.target.value.trim().toLowerCase() })}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="max-moves">
                        Move limit (0 = no limit)
                      </label>
                      <input
                        id="max-moves"
                        type="number"
                        min={0}
                        max={40}
                        className={`${inputClass} mt-1`}
                        value={draft.maxMoves}
                        onChange={(event) => patch({ maxMoves: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="targets">
                        Collect targets
                      </label>
                      <input
                        id="targets"
                        className={`${inputClass} mt-1 font-mono`}
                        placeholder="a4 d4 d1"
                        value={squaresToText(draft.targets)}
                        onChange={(event) => patch({ targets: splitTokens(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="obstacles">
                        Blocked squares
                      </label>
                      <input
                        id="obstacles"
                        className={`${inputClass} mt-1 font-mono`}
                        placeholder="a4"
                        value={squaresToText(draft.obstacles)}
                        onChange={(event) => patch({ obstacles: splitTokens(event.target.value) })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="solution">
                        Model solution (UCI, space separated)
                      </label>
                      <input
                        id="solution"
                        className={`${inputClass} mt-1 font-mono`}
                        placeholder="e2e4"
                        value={movesToText(draft.acceptedSolutions[0]?.moves || [])}
                        onChange={(event) => patch({ acceptedSolutions: [{ moves: splitTokens(event.target.value) }] })}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.goalConfig.acceptAnyGoalMove)}
                        onChange={(event) => patchGoalConfig({ acceptAnyGoalMove: event.target.checked })}
                      />
                      Accept any move that achieves the goal, not only the model solution
                    </label>
                  </>
                ) : null}

                {isInformation ? (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="key-points">
                        Teaching points (one per line)
                      </label>
                      <textarea
                        id="key-points"
                        rows={5}
                        className={`${inputClass} mt-1`}
                        value={(draft.goalConfig.keyPoints || []).join("\n")}
                        onChange={(event) =>
                          patchGoalConfig({ keyPoints: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="demo-moves">
                        Worked example (UCI, space separated - optional)
                      </label>
                      <input
                        id="demo-moves"
                        className={`${inputClass} mt-1 font-mono`}
                        placeholder="e2e4 e7e5 g1f3"
                        value={movesToText(draft.goalConfig.demoMoves || [])}
                        onChange={(event) => patchGoalConfig({ demoMoves: splitTokens(event.target.value) })}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        The student steps through these on the board. In a legal-chess lesson the moves must alternate colours,
                        just like a real game.
                      </p>
                    </div>
                  </>
                ) : null}

                {isSequence ? (
                  <div className="sm:col-span-2 space-y-2 rounded-2xl bg-slate-50 p-3">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                      <AlertTriangle size={16} className="text-amber-500" /> Move sequence
                    </div>
                    {draft.opponentScript.map((step, index) => (
                      <div key={index} className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
                        <select
                          className={inputClass}
                          value={step.actor}
                          onChange={(event) => {
                            const next = [...draft.opponentScript];
                            next[index] = { ...step, actor: event.target.value as "student" | "opponent" };
                            patch({ opponentScript: next });
                          }}
                        >
                          <option value="student">Student</option>
                          <option value="opponent">Reply</option>
                        </select>
                        <input
                          className={`${inputClass} font-mono`}
                          placeholder={step.actor === "opponent" ? "h8g8" : "a1a8 (accepted moves)"}
                          value={step.actor === "opponent" ? step.move || "" : movesToText(step.acceptedMoves)}
                          onChange={(event) => {
                            const next = [...draft.opponentScript];
                            next[index] =
                              step.actor === "opponent"
                                ? { ...step, move: event.target.value.trim().toLowerCase() }
                                : { ...step, acceptedMoves: splitTokens(event.target.value) };
                            patch({ opponentScript: next });
                          }}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => patch({ opponentScript: [...draft.opponentScript, { actor: "student", acceptedMoves: [] }] })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                      >
                        Add student move
                      </button>
                      <button
                        type="button"
                        onClick={() => patch({ opponentScript: [...draft.opponentScript, { actor: "opponent", move: "", acceptedMoves: [] }] })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                      >
                        Add reply
                      </button>
                      {draft.opponentScript.length ? (
                        <button
                          type="button"
                          onClick={() => patch({ opponentScript: draft.opponentScript.slice(0, -1) })}
                          className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700"
                        >
                          Remove last
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className={isInformation ? "hidden" : "sm:col-span-2"}>
                  <label className={labelClass} htmlFor="hint">
                    Hint
                  </label>
                  <input
                    id="hint"
                    className={`${inputClass} mt-1`}
                    value={draft.hints[0]?.text || ""}
                    onChange={(event) => patch({ hints: [{ text: event.target.value, showAfterErrors: 1 }] })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="explanation">
                    {isInformation ? "Takeaway shown after the slide" : "Explanation shown after solving"}
                  </label>
                  <textarea
                    id="explanation"
                    rows={2}
                    className={`${inputClass} mt-1`}
                    value={draft.explanation}
                    onChange={(event) => patch({ explanation: event.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function BookIcon() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand">
      <BookOpenCheck size={22} />
    </div>
  );
}
