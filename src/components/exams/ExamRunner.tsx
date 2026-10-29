"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Eye, HelpCircle, Loader2, LogOut, ShieldAlert, Trophy } from "lucide-react";
import { toast } from "sonner";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";
import {
  EXAM_DURATION_MINUTES,
  EXAM_RULES,
  HEARTBEAT_INTERVAL_MS,
  HINT_PENALTY,
  MCQ_MARKS,
  POSITION_MARKS,
  WRONG_MOVE_PENALTY,
} from "@/lib/exams/examRules";
import type { ExamResult } from "@/lib/exams/examReport";
import { cn } from "@/lib/utils";
import { CertificateBadge, FenDiagram, SubmitReasonBadge, TopicBreakdownList, istDateTime } from "./examUi";

type Mcq = { id: string; question: string; positionFen: string; topicName: string; options: { id: string; text: string }[]; selected: string | null };
type Position = {
  id: string;
  topicName: string;
  fen: string;
  orientation: "white" | "black";
  wrongMoves: number;
  hintsUsed: number;
  solved: boolean;
  available: number;
  marks: number;
  hint: { san: string; from: string; to: string } | null;
  question?: string;
};
export type Exam = {
  id: string;
  levelLabel: string;
  status: string;
  availableUntil: string;
  endsAt: string | null;
  serverNow: string;
  submittedAt: string | null;
  submitReason: string | null;
  submitReasonLabel: string | null;
  warnings: number;
  score: { mcq: number; positions: number; total: number; max: number } | null;
  certificate: { status: string; url: string; number: string } | null;
  mcqs?: Mcq[];
  positions?: Position[];
  result?: ExamResult;
};

/**
 * Exams this page load started (or already reported as reopened). A sitting
 * that is in progress when the page loads, and is not in here, was reloaded
 * or reopened. Module-level so React's development double-mount cannot
 * report it twice.
 */
const handledThisLoad = new Set<string>();

/** How long "Answer saved" shows before a locked MCQ moves on to the next question. */
const MCQ_ADVANCE_DELAY_MS = 700;
/** Longer for a solved position, so the final board and the marks can be seen. */
const POSITION_ADVANCE_DELAY_MS = 1500;

/**
 * Everything the exam screens ask of the outside world. The real sitting
 * talks to /api/exams/[id]; the admin preview answers the same calls from
 * the paper in the browser, so the screens are identical and nothing is saved.
 */
export type ExamActions = {
  preview: boolean;
  /** Where "Back" goes: the Exam Center for students, the Exams page for a preview. */
  backHref: string;
  load(): Promise<{ exam?: Exam; error?: string }>;
  call(body: Record<string, unknown>, keepalive?: boolean): Promise<any>;
  /** The last word from a closing page. */
  beacon(): void;
};

const ActionsContext = createContext<ExamActions | null>(null);

function useExamActions() {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("Exam screens need ExamActions");
  return actions;
}

async function post(id: string, body: Record<string, unknown>, keepalive = false) {
  const response = await fetch(`/api/exams/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: any = new Error(data.error || "Something went wrong.");
    error.code = data.code;
    throw error;
  }
  return data;
}

function serverActions(id: string): ExamActions {
  return {
    preview: false,
    backHref: "/exams",
    async load() {
      const response = await fetch(`/api/exams/${id}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      return response.ok ? { exam: data.exam } : { error: data.error || "Could not open this exam." };
    },
    call: (body, keepalive) => post(id, body, keepalive),
    beacon() {
      const body = new Blob([JSON.stringify({ action: "violation", type: "app_closed" })], { type: "application/json" });
      navigator.sendBeacon?.(`/api/exams/${id}`, body);
    },
  };
}

export default function ExamRunner({ id }: { id: string }) {
  const actions = useMemo(() => serverActions(id), [id]);
  return <ExamFlow actions={actions} />;
}

/** The whole student journey (rules, sitting, result) for whichever actions it is given. */
export function ExamFlow({ actions }: { actions: ExamActions }) {
  return (
    <ActionsContext.Provider value={actions}>
      <ExamFlowInner />
    </ActionsContext.Provider>
  );
}

function ExamFlowInner() {
  const actions = useExamActions();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const data = await actions.load();
    if (!data.exam) {
      setLoadError(data.error || "Could not open this exam.");
      return null;
    }
    setExam(data.exam);
    return data.exam;
  }, [actions]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
        {loadError} <Link href={actions.backHref} className="underline">Go back</Link>
      </div>
    );
  }
  if (!exam) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Opening the exam...
      </div>
    );
  }
  if (exam.status === "assigned") {
    return (
      <RulesScreen
        exam={exam}
        onStarted={(started) => {
          handledThisLoad.add(started.id);
          setExam(started);
        }}
      />
    );
  }
  if (exam.status === "in_progress") return <Sitting exam={exam} setExam={setExam} reload={load} />;
  if (exam.status === "submitted") return <ResultScreen exam={exam} />;
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
      <div className="text-lg font-black text-slate-950">{exam.levelLabel}</div>
      <p className="mt-2 text-sm text-slate-600">
        {exam.status === "expired" ? `This exam closed on ${istDateTime(exam.availableUntil)} without being started.` : "This exam was cancelled."} Ask the academy if you need it again.
      </p>
      <Link href={actions.backHref} className="btn btn-outline mt-4 inline-flex">Go back</Link>
    </div>
  );
}

/* ------------------------------------------------------------------ before */

function RulesScreen({ exam, onStarted }: { exam: Exam; onStarted: (exam: Exam) => void }) {
  const actions = useExamActions();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const data = await actions.call({ action: "start" });
      onStarted(data.exam);
    } catch (error: any) {
      toast.error(error.message);
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center gap-2 text-brand">
          <ShieldAlert size={22} />
          <h1 className="text-xl font-black">{exam.levelLabel} exam: read before you start</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">Open until {istDateTime(exam.availableUntil)}.</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-800">
          {EXAM_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <label className="mt-5 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          I have read the rules. I understand I cannot pause or leave once I start, and that leaving twice submits my exam.
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href={actions.backHref} className="btn btn-outline justify-center">{actions.preview ? "Close preview" : "Not now"}</Link>
          <button type="button" className="btn btn-primary justify-center" disabled={!agreed || starting} onClick={start}>
            {starting ? <Loader2 size={16} className="animate-spin" /> : null} Start the exam ({EXAM_DURATION_MINUTES} min)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ during */

function useCountdown(endsAt: string | null, serverNow: string) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const [left, setLeft] = useState(() => (endsAt ? Math.max(0, new Date(endsAt).getTime() - (Date.now() + offset)) : 0));
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setLeft(Math.max(0, new Date(endsAt).getTime() - (Date.now() + offset)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, offset]);
  return left;
}

function clock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function Sitting({ exam, setExam, reload }: { exam: Exam; setExam: (exam: Exam) => void; reload: () => Promise<Exam | null> }) {
  const actions = useExamActions();
  const mcqs = useMemo(() => exam.mcqs || [], [exam.mcqs]);
  const positions = useMemo(() => exam.positions || [], [exam.positions]);
  const items = useMemo(
    () => [...mcqs.map((mcq) => ({ kind: "mcq" as const, id: mcq.id })), ...positions.map((position) => ({ kind: "position" as const, id: position.id }))],
    [mcqs, positions]
  );
  const [index, setIndex] = useState(0);
  const [warning, setWarning] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const left = useCountdown(exam.endsAt, exam.serverNow);
  const endedRef = useRef(false);

  const finished = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    await reload();
  }, [reload]);

  const handleEnded = useCallback(
    (error: any) => {
      if (error?.code === "submitted" || error?.code === "not_running" || error?.code === "reload") {
        void finished();
        return true;
      }
      return false;
    },
    [finished]
  );

  // Another tab or app took over the screen. Shared by the real event and the preview's button.
  const leftTheExam = useCallback(() => {
    actions
      .call({ action: "violation", type: "tab_hidden" }, true)
      .then((data) => {
        if (data.outcome === "submit") void finished();
        else if (data.outcome === "warn") setWarning(true);
      })
      .catch(handleEnded);
  }, [actions, finished, handleEnded]);

  // A sitting that was already running when this page loaded was reloaded or reopened.
  useEffect(() => {
    if (handledThisLoad.has(exam.id)) return;
    handledThisLoad.add(exam.id);
    actions.call({ action: "violation", type: "page_reopened" })
      .then((data) => {
        if (data.outcome === "submit") void finished();
        else if (data.outcome === "warn") setWarning(true);
      })
      .catch(handleEnded);
  }, [exam.id, actions, finished, handleEnded]);

  // Leaving: another tab or app hides this one. Closing the page sends a last goodbye.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== "hidden" || endedRef.current) return;
      leftTheExam();
    }
    function onPageHide() {
      if (endedRef.current) return;
      actions.beacon();
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (endedRef.current || actions.preview) return;
      event.preventDefault();
      event.returnValue = "Leaving now submits your exam.";
    }
    // The back button would leave the exam: put the page back and say why.
    function onPopState() {
      if (endedRef.current) return;
      window.history.pushState(null, "", window.location.href);
      toast.error("You cannot leave the exam. Use Finish exam when you are done.");
    }
    window.history.pushState(null, "", window.location.href);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [actions, leftTheExam]);

  // Still here: without this the sweep treats the sitting as closed after 3 minutes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      actions.call({ action: "heartbeat" }, true)
        .then((data) => {
          if (data.status !== "in_progress") void finished();
        })
        .catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [actions, finished]);

  useEffect(() => {
    if (left > 0 || !exam.endsAt || endedRef.current) return;
    actions
      .call({ action: "submit" })
      .catch(() => undefined)
      .finally(() => void finished());
  }, [left, exam.endsAt, actions, finished]);

  /** Moves on from a finished question after `delayMs`, unless the student already went elsewhere. */
  function advanceFrom(questionId: string, delayMs: number) {
    const from = items.findIndex((item) => item.id === questionId);
    if (from >= 0 && from < items.length - 1) {
      window.setTimeout(() => setIndex((now) => (now === from ? from + 1 : now)), delayMs);
    }
  }

  function patchMcq(questionId: string, selected: string) {
    setExam({ ...exam, mcqs: mcqs.map((mcq) => (mcq.id === questionId ? { ...mcq, selected } : mcq)) });
    advanceFrom(questionId, MCQ_ADVANCE_DELAY_MS);
  }

  function patchPosition(questionId: string, patch: Partial<Position>) {
    const wasSolved = Boolean(positions.find((position) => position.id === questionId)?.solved);
    setExam({ ...exam, positions: positions.map((position) => (position.id === questionId ? { ...position, ...patch } : position)) });
    if (patch.solved && !wasSolved) advanceFrom(questionId, POSITION_ADVANCE_DELAY_MS);
  }

  async function finish() {
    setFinishing(true);
    try {
      endedRef.current = true;
      const data = await actions.call({ action: "submit" });
      setExam(data.exam);
    } catch (error: any) {
      if (!handleEnded(error)) {
        endedRef.current = false;
        toast.error(error.message);
      }
    } finally {
      setFinishing(false);
      setConfirmFinish(false);
    }
  }

  const current = items[index];
  const answered = mcqs.filter((mcq) => mcq.selected).length;
  const solved = positions.filter((position) => position.solved).length;
  const lowTime = left < 5 * 60_000;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#fbf7ff]">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        {actions.preview && <PreviewBar onLeave={leftTheExam} />}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-950">{exam.levelLabel} exam</div>
            <div className="text-xs text-slate-500">
              MCQs {answered}/{mcqs.length} · positions solved {solved}/{positions.length}
            </div>
          </div>
          <div className={cn("ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-black", lowTime ? "bg-red-50 text-red-700" : "bg-brand/10 text-brand")}>
            <Clock size={16} /> {clock(left)}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setConfirmFinish(true)}>
            Finish exam
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:px-4">
          {items.map((item, itemIndex) => {
            const done = item.kind === "mcq" ? Boolean(mcqs.find((mcq) => mcq.id === item.id)?.selected) : Boolean(positions.find((position) => position.id === item.id)?.solved);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  "h-8 min-w-8 shrink-0 rounded-md border px-1.5 text-xs font-bold",
                  itemIndex === index ? "border-brand bg-brand text-white" : done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
                )}
                title={item.kind === "mcq" ? `MCQ ${itemIndex + 1}` : `Position ${itemIndex - mcqs.length + 1}`}
              >
                {item.kind === "mcq" ? `Q${itemIndex + 1}` : `P${itemIndex - mcqs.length + 1}`}
              </button>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-6xl p-3 sm:p-4">
        {current?.kind === "mcq" && (
          <McqPanel
            key={current.id}
            mcq={mcqs.find((mcq) => mcq.id === current.id)!}
            number={index + 1}
            onAnswered={patchMcq}
            onEnded={handleEnded}
          />
        )}
        {current?.kind === "position" && (
          <PositionPanel
            key={current.id}
            position={positions.find((position) => position.id === current.id)!}
            number={index - mcqs.length + 1}
            onPatch={patchPosition}
            onEnded={handleEnded}
          />
        )}
        <div className="mt-4 flex justify-between">
          <button type="button" className="btn btn-outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <ChevronLeft size={16} /> Previous
          </button>
          <button type="button" className="btn btn-outline" disabled={index >= items.length - 1} onClick={() => setIndex(index + 1)}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </main>

      {warning && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-red-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <AlertTriangle size={40} className="mx-auto text-red-600" />
            <h2 className="mt-2 text-xl font-black text-red-700">Warning: you left the exam</h2>
            <p className="mt-2 text-sm text-slate-700">
              You switched to another tab or app, or reopened the exam. This is your only warning. <b>If you leave again, your exam is submitted straight away</b> with the answers you have so far.
            </p>
            <button type="button" className="btn btn-primary mt-5 w-full justify-center" onClick={() => setWarning(false)}>
              Back to the exam
            </button>
          </div>
        </div>
      )}

      {confirmFinish && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-slate-950">Submit your exam now?</h2>
            <p className="mt-2 text-sm text-slate-700">
              You answered {answered} of {mcqs.length} MCQs and solved {solved} of {positions.length} positions. Anything left unanswered scores 0. You cannot change answers after this.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmFinish(false)} disabled={finishing}>
                Keep going
              </button>
              <button type="button" className="btn btn-primary" onClick={finish} disabled={finishing}>
                {finishing ? <Loader2 size={16} className="animate-spin" /> : null} Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function McqPanel({ mcq, number, onAnswered, onEnded }: { mcq: Mcq; number: number; onAnswered: (id: string, selected: string) => void; onEnded: (error: any) => boolean }) {
  const actions = useExamActions();
  const [choice, setChoice] = useState(mcq.selected || "");
  const [saving, setSaving] = useState(false);
  const locked = Boolean(mcq.selected);

  async function save() {
    setSaving(true);
    try {
      await actions.call({ action: "mcq", questionId: mcq.id, optionId: choice });
      onAnswered(mcq.id, choice);
    } catch (error: any) {
      if (!onEnded(error)) toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <b className="text-brand">Question {number}</b>
        <span className="rounded-full bg-accent/40 px-2 py-0.5 text-xs font-bold text-brand">{MCQ_MARKS} marks · one try</span>
      </div>
      <div className={cn("grid gap-4", mcq.positionFen && "lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start")}>
        {mcq.positionFen && <FenDiagram fen={mcq.positionFen} size={300} />}
        <div>
          <div className="rounded-lg bg-slate-50 p-3 text-base font-semibold text-slate-900">{mcq.question}</div>
          <div className="mt-3 grid gap-2">
            {mcq.options.map((option) => (
              <label key={option.id} className={cn("flex items-center gap-3 rounded-lg border p-3 text-sm font-semibold", choice === option.id ? "border-brand bg-brand/5" : "border-slate-200", locked && "opacity-80")}>
                <input type="radio" name={mcq.id} disabled={locked} checked={choice === option.id} onChange={() => setChoice(option.id)} />
                <span>{option.text}</span>
              </label>
            ))}
          </div>
          {locked ? (
            <div className="mt-3 flex items-center gap-1.5 text-sm font-bold text-emerald-700">
              <CheckCircle2 size={16} /> Answer saved. It cannot be changed.
            </div>
          ) : (
            <button type="button" className="btn btn-primary mt-3" disabled={!choice || saving} onClick={save}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : null} Lock in answer
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function PositionPanel({
  position,
  number,
  onPatch,
  onEnded,
}: {
  position: Position;
  number: number;
  onPatch: (id: string, patch: Partial<Position>) => void;
  onEnded: (error: any) => boolean;
}) {
  const actions = useExamActions();
  const [shownFen, setShownFen] = useState(position.fen);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "info" | "bad" | "good"; text: string }>({ tone: "info", text: "Find the best move." });
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [confirmHint, setConfirmHint] = useState(false);
  const game = useMemo(() => {
    try {
      return new Chess(shownFen);
    } catch {
      return new Chess();
    }
  }, [shownFen]);

  const locked = position.solved || busy;

  async function commit(from: string, to: string, promotion: PromotionPiece = "q") {
    if (locked) return false;
    const before = shownFen;
    let after = "";
    try {
      const local = new Chess(before);
      local.move({ from, to, promotion });
      after = local.fen();
    } catch {
      return false;
    }
    setShownFen(after);
    setSelected(null);
    setBusy(true);
    actions
      .call({ action: "move", questionId: position.id, from, to, promotion })
      .then((data) => {
        if (!data.legal) {
          setShownFen(before);
          return;
        }
        if (!data.correct) {
          setShownFen(before);
          setFeedback({ tone: "bad", text: `Not the move. −${WRONG_MOVE_PENALTY} marks. Try again.` });
          onPatch(position.id, { wrongMoves: data.wrongMoves, available: data.available });
          return;
        }
        setShownFen(data.fen);
        setFeedback(data.solved ? { tone: "good", text: `Solved. ${data.marks} of ${POSITION_MARKS} marks.` } : { tone: "good", text: `Correct${data.reply ? `, the reply was ${data.reply.san}` : ""}. Keep going.` });
        onPatch(position.id, { fen: data.fen, solved: data.solved, available: data.available, marks: data.marks ?? 0, hint: null });
      })
      .catch((error) => {
        setShownFen(before);
        if (!onEnded(error)) toast.error(error.message);
      })
      .finally(() => setBusy(false));
    return true;
  }

  async function hint() {
    setConfirmHint(false);
    setBusy(true);
    try {
      const data = await actions.call({ action: "hint", questionId: position.id });
      onPatch(position.id, { hint: data.hint, hintsUsed: data.hintsUsed, available: data.available });
      setFeedback({ tone: "info", text: `Hint: play ${data.hint.san}.` });
    } catch (error: any) {
      if (!onEnded(error)) toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  const targets = useMemo(() => (selected && !locked ? legalTargetsFromGame(game, selected) : []), [selected, locked, game]);
  const hintStyles = useMemo(() => buildMoveHintStyles(targets, selected), [targets, selected]);

  function onSquareClick(square: string) {
    if (locked) return;
    if (selected && selected !== square) {
      if (isPromotionMove(game, selected, square)) {
        setPendingPromotion({ from: selected, to: square });
        return;
      }
      if (targets.includes(square as any)) {
        void commit(selected, square);
        return;
      }
    }
    const piece = game.get(square as any);
    setSelected(piece && piece.color === game.turn() && selected !== square ? square : null);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-brand">Position {number}</b>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">{position.topicName || "General"}</span>
          </div>
          {position.question && <div className="mt-1 text-base font-bold text-slate-900">{position.question}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Worth now</div>
          <div className={cn("text-xl font-black", position.available < POSITION_MARKS ? "text-amber-700" : "text-slate-950")}>
            {position.solved ? position.marks : position.available}
            <span className="text-xs text-slate-500">/{POSITION_MARKS}</span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-lg bg-[#31210f] p-1.5 sm:p-3">
          <AssignmentChessboard
            maxWidth={520}
            viewportBottomReserve={120}
            coordinatesClassName="text-[#f0d9b5]"
            position={shownFen}
            boardOrientation={position.orientation}
            arePiecesDraggable={!locked}
            onPieceDrop={(from, to) => {
              if (isPromotionMove(game, from, to)) return false;
              void commit(from, to);
              return true;
            }}
            onPromotionCheck={(from, to) => isPromotionMove(game, from, to)}
            onPromotionPieceSelect={(piece, from, to) => {
              const promotion = promotionFromBoardPiece(piece);
              const move = from && to ? { from, to } : pendingPromotion;
              setPendingPromotion(null);
              if (!promotion || !move) return false;
              void commit(move.from, move.to, promotion);
              return true;
            }}
            showPromotionDialog={Boolean(pendingPromotion)}
            promotionToSquare={pendingPromotion?.to as any}
            // The default picker stacks the pieces over the target square and is crushed to a sliver on this board.
            promotionDialogVariant="modal"
            onSquareClick={onSquareClick as any}
            customSquareStyles={hintStyles as any}
            customArrows={position.hint && !position.solved ? ([[position.hint.from, position.hint.to, "rgb(234 179 8)"]] as any) : []}
            customDarkSquareStyle={{ backgroundColor: "#b58863" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />
        </div>
        <div className="space-y-3">
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold",
              feedback.tone === "bad" ? "bg-red-50 text-red-700" : feedback.tone === "good" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-700"
            )}
          >
            {position.solved ? `Solved. ${position.marks} of ${POSITION_MARKS} marks.` : feedback.text}
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
            <div>Wrong moves: <b>{position.wrongMoves}</b> (−{WRONG_MOVE_PENALTY} each)</div>
            <div>Hints: <b>{position.hintsUsed}</b> (−{HINT_PENALTY} each)</div>
            <div className="mt-1">A position never goes below 0.</div>
          </div>
          {!position.solved && (
            <button
              type="button"
              className="btn btn-outline w-full justify-center"
              disabled={busy}
              onClick={() => (position.hint ? setFeedback({ tone: "info", text: `Hint: play ${position.hint.san}.` }) : setConfirmHint(true))}
            >
              <HelpCircle size={15} /> {position.hint ? "Show my hint again" : `Hint (−${HINT_PENALTY} marks)`}
            </button>
          )}
        </div>
      </div>

      {confirmHint && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-950">Take a hint?</h3>
            <p className="mt-2 text-sm text-slate-700">
              The hint shows the next move and takes away {HINT_PENALTY} marks from this position. This position is worth {position.available} right now.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmHint(false)}>No</button>
              <button type="button" className="btn btn-primary" onClick={hint}>Yes, show it</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ after */

function ResultScreen({ exam }: { exam: Exam }) {
  const actions = useExamActions();
  const score = exam.score;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <Trophy size={36} className="mx-auto text-brand" />
        <h1 className="mt-2 text-xl font-black text-slate-950">{exam.levelLabel} exam complete</h1>
        {score && (
          <div className="mt-2 text-4xl font-black text-brand">
            {score.total}
            <span className="text-lg text-slate-500">/{score.max}</span>
          </div>
        )}
        {score && (
          <div className="mt-1 text-sm text-slate-600">
            MCQs {score.mcq}/20 · Positions {score.positions}/80
          </div>
        )}
        <div className="mt-2 text-xs text-slate-500">Submitted {istDateTime(exam.submittedAt)}</div>
        {exam.submitReason && exam.submitReason !== "completed" && (
          <div className="mt-2">
            <SubmitReasonBadge reason={exam.submitReason} />
          </div>
        )}
        <div className="mt-4 flex flex-col items-center gap-2">
          {actions.preview ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Preview: nothing was saved and no certificate is requested.</div>
          ) : exam.certificate?.url ? (
            <a href={exam.certificate.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-black text-brand">
              <Download size={16} /> Download certificate
            </a>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              Certificate: <CertificateBadge status={exam.certificate?.status} />
            </div>
          )}
          <Link href={actions.backHref} className="text-sm font-bold text-brand underline">
            {actions.preview ? "Back to the Exams page" : "Back to the Exam Center"}
          </Link>
        </div>
      </section>

      {exam.result && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-black text-slate-950">MCQs</h2>
            <ul className="space-y-1 text-sm">
              {exam.result.mcqs.map((mcq, index) => (
                <li key={mcq.id} className="flex justify-between gap-2">
                  <span className="text-slate-700">Q{index + 1} · {mcq.topicName}</span>
                  <span className={cn("font-bold", mcq.correct ? "text-emerald-700" : "text-red-700")}>{!mcq.answered ? "Not answered" : mcq.correct ? `+${mcq.marks}` : "0"}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-black text-slate-950">Positions</h2>
            <ul className="space-y-1 text-sm">
              {exam.result.positions.map((position, index) => (
                <li key={position.id} className="flex justify-between gap-2">
                  <span className="text-slate-700">P{index + 1} · {position.topicName}</span>
                  <span className={cn("font-bold", position.solved ? "text-emerald-700" : "text-red-700")}>
                    {position.solved ? `${position.marks}/5` : "Not solved"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {exam.result && exam.result.topics.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-black text-slate-950">By topic</h2>
          <TopicBreakdownList breakdown={exam.result} />
        </section>
      )}

      {exam.result && <AnswerReview result={exam.result} />}
    </div>
  );
}

/** The right answers to the MCQs the student missed and the positions they did not solve. */
function AnswerReview({ result }: { result: ExamResult }) {
  const mcqs = result.mcqs.map((mcq, index) => ({ ...mcq, number: index + 1 })).filter((mcq) => mcq.review);
  const positions = result.positions.map((position, index) => ({ ...position, number: index + 1 })).filter((position) => position.review);
  if (!mcqs.length && !positions.length) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
        <CheckCircle2 size={16} /> Every MCQ right and every position solved. Nothing to review.
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-black text-slate-950">Review your mistakes</h2>
        <p className="text-sm text-slate-600">The right answers to the questions you missed and the positions you did not solve.</p>
      </div>
      {mcqs.map(({ id, number, topicName, answered, review }) => (
        <article key={id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <b className="text-brand">Question {number}</b>
            <span className="text-xs font-semibold text-slate-500">{topicName}{answered ? "" : " · not answered"}</span>
          </div>
          <div className={cn("grid gap-4", review!.positionFen && "md:grid-cols-[240px_minmax(0,1fr)] md:items-start")}>
            {review!.positionFen && <FenDiagram fen={review!.positionFen} size={220} />}
            <div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-900">{review!.question}</div>
              <ul className="mt-2 grid gap-1.5">
                {review!.options.map((option) => {
                  const right = option.id === review!.correctOptionId;
                  const chosen = option.id === review!.selected;
                  return (
                    <li
                      key={option.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                        right ? "border-emerald-300 bg-emerald-50 font-bold text-emerald-800" : chosen ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-slate-700"
                      )}
                    >
                      <span>{option.text}</span>
                      {right ? <span className="text-xs">Right answer</span> : chosen ? <span className="text-xs">Your answer</span> : null}
                    </li>
                  );
                })}
              </ul>
              {review!.explanation && <p className="mt-2 text-sm text-slate-700">{review!.explanation}</p>}
            </div>
          </div>
        </article>
      ))}
      {positions.map(({ id, number, topicName, review }) => (
        <article key={id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <b className="text-brand">Position {number}</b>
            <span className="text-xs font-semibold text-slate-500">{topicName} · not solved</span>
          </div>
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
            <FenDiagram fen={review!.startFen} orientation={review!.orientation} size={220} />
            <div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-900">{review!.question}</div>
              <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span className="font-bold">Solution:</span> <span className="font-mono">{review!.solution}</span>
              </div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

/** Shown only in the admin preview: what this is, a way out, and a way to feel the leave rule. */
function PreviewBar({ onLeave }: { onLeave: () => void }) {
  const actions = useExamActions();
  return (
    <div className="flex flex-wrap items-center gap-2 bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 sm:px-4">
      <Eye size={14} /> Admin preview: exactly what a student sees. Answers are checked the same way, but nothing is saved.
      <button type="button" onClick={onLeave} className="ml-auto rounded-md border border-amber-300 bg-white px-2 py-1 hover:bg-amber-50">
        Simulate leaving the tab
      </button>
      <Link href={actions.backHref} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 hover:bg-amber-50">
        <LogOut size={12} /> Exit preview
      </Link>
    </div>
  );
}
