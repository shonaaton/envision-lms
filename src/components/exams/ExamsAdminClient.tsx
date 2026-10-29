"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Eye, Loader2, Pencil, RefreshCw, Send, Shuffle, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { MCQ_COUNT, POSITION_COUNT } from "@/lib/exams/examRules";
import { cn } from "@/lib/utils";
import { ExamResultsTable, FenDiagram, type StaffRow } from "./examUi";

type PaperSummary = { tier: string; levelNumber: number; levelLabel: string; status: "none" | "draft" | "published"; version: number; publishedAt: string | null; updatedAt: string | null };
type BankCount = { tier: string; levelNumber: number; templates: number; mcqs: number; positions: number; mcqsFromPositions: number };
type Paper = {
  id: string;
  tier: string;
  levelNumber: number;
  levelLabel: string;
  status: "draft" | "published";
  version: number;
  publishedAt: string | null;
  mcqs: { id: string; question: string; positionFen: string; options: { id: string; text: string; correct: boolean }[]; explanation: string; topicName: string; sourceTitle: string; generated: boolean }[];
  positions: { id: string; topicName: string; title: string; question: string; autoQuestion: string; startFen: string; solution: string[]; studentColor: "white" | "black"; sourceTitle: string }[];
};
type Targets = {
  students: { id: string; name: string; username: string }[];
  batches: { id: string; name: string; studentCount: number }[];
  classrooms: { id: string; title: string; status: string; levelName: string; studentCount: number }[];
};

const levelKey = (tier: string, level: number) => `${tier}:${level}`;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function postAction(body: Record<string, unknown>) {
  return api("/api/admin/exams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export default function ExamsAdminClient() {
  const [tab, setTab] = useState<"papers" | "assignments">("papers");
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [bank, setBank] = useState<BankCount[] | null>(null);
  const [openLevel, setOpenLevel] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  // The "closed without an attempt" notice links to ?tab=assignments&status=expired.
  const [initialStatus, setInitialStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "assignments") setTab("assignments");
    setInitialStatus(params.get("status") || "");
  }, []);

  const loadPapers = useCallback(async () => {
    try {
      setPapers((await api("/api/admin/exams?view=papers")).papers || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    void loadPapers();
    api("/api/admin/exams?view=bank")
      .then((data) => setBank(data.bank || []))
      .catch((error) => toast.error(error.message));
  }, [loadPapers]);

  const published = papers.filter((paper) => paper.status === "published");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="rounded-xl bg-brand/10 p-2.5 text-brand">
          <ClipboardCheck size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-slate-950">Exams</h1>
          <p className="text-sm text-slate-600">
            One paper per level, drawn from that level&apos;s homework: {MCQ_COUNT} MCQs and {POSITION_COUNT} positions. Review it, replace any question, publish, then assign.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAssigning(true)} disabled={!published.length}>
          <UserPlus size={16} /> Assign exam
        </button>
      </header>

      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm sm:w-fit">
        {(["papers", "assignments"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn("rounded-lg px-4 py-2 text-sm font-bold", tab === value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50")}
          >
            {value === "papers" ? "Question papers" : "Assigned exams"}
          </button>
        ))}
      </div>

      {tab === "papers" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {papers.map((paper) => {
              const key = levelKey(paper.tier, paper.levelNumber);
              const count = bank?.find((item) => levelKey(item.tier, item.levelNumber) === key);
              const short = count && (count.positions < POSITION_COUNT || count.mcqs + count.mcqsFromPositions < MCQ_COUNT);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOpenLevel(openLevel === key ? "" : key)}
                  className={cn("rounded-xl border bg-white p-4 text-left shadow-sm transition", openLevel === key ? "border-brand ring-2 ring-brand/20" : "border-slate-200 hover:border-brand/40")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-slate-950">{paper.levelLabel}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        paper.status === "published" ? "bg-emerald-50 text-emerald-700" : paper.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {paper.status === "published" ? `Published v${paper.version}` : paper.status === "draft" ? "Draft" : "No paper"}
                    </span>
                  </div>
                  <div className={cn("mt-2 text-xs", short ? "text-red-700" : "text-slate-500")}>
                    {count ? `Homework bank: ${count.mcqs} MCQs, ${count.positions} positions (${count.templates} templates)` : "Counting the homework bank..."}
                    {count && count.mcqs < MCQ_COUNT && count.positions >= POSITION_COUNT && (
                      <span className="block">
                        {count.mcqs + count.mcqsFromPositions >= MCQ_COUNT
                          ? `${MCQ_COUNT - count.mcqs} MCQs will be made from spare positions.`
                          : `Only ${count.mcqsFromPositions} spare positions to make MCQs from: add homework.`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {openLevel && (
            <PaperView
              key={openLevel}
              tier={openLevel.split(":")[0]}
              level={Number(openLevel.split(":")[1])}
              onChanged={loadPapers}
            />
          )}
        </>
      )}

      {tab === "assignments" && <AssignmentsTab papers={papers} initialStatus={initialStatus} />}

      {assigning && (
        <AssignDialog
          papers={published}
          onClose={() => setAssigning(false)}
          onAssigned={() => {
            setAssigning(false);
            setTab("assignments");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ papers */

function PaperView({ tier, level, onChanged }: { tier: string; level: number; onChanged: () => void }) {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    api(`/api/admin/exams?view=paper&tier=${tier}&level=${level}`)
      .then((data) => alive && setPaper(data.paper))
      .catch((error) => toast.error(error.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tier, level]);

  async function run(action: string, extra: Record<string, unknown> = {}, label = action) {
    setBusy(label);
    try {
      const data = await postAction({ action, tier, level, ...extra });
      setPaper(data.paper);
      onChanged();
      return true;
    } catch (error: any) {
      toast.error(error.message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function regenerate() {
    if (paper && !window.confirm("Draw a completely new paper? Every question on it will change. Exams already assigned keep their questions.")) return;
    if (await run("generate_paper", {}, "generate")) toast.success("New paper drawn.");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading the paper...
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-slate-950">{paper?.levelLabel || `${tier} Level ${level}`} paper</h2>
          <p className="text-xs text-slate-500">
            {paper
              ? paper.status === "published"
                ? `Published, version ${paper.version}. Changes apply to exams assigned from now on; exams already assigned keep their own copy.`
                : "Draft: students cannot get this paper until it is published."
              : "No paper yet. Draw one from this level's homework."}
          </p>
        </div>
        {paper && (
          <Link href={`/admin/exams/preview?tier=${tier}&level=${level}`} className="btn btn-outline" title="Open this paper exactly as a student sees it. Nothing is saved.">
            <Eye size={16} /> Sit it as a student
          </Link>
        )}
        <button type="button" className="btn btn-outline" onClick={regenerate} disabled={Boolean(busy)}>
          {busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {paper ? "Regenerate all" : "Generate paper"}
        </button>
        {paper?.status === "draft" && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={Boolean(busy) || paper.mcqs.length !== MCQ_COUNT || paper.positions.length !== POSITION_COUNT}
            onClick={async () => {
              if (await run("publish", {}, "publish")) toast.success("Paper published.");
            }}
          >
            {busy === "publish" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Publish
          </button>
        )}
      </div>

      {paper && (
        <>
          <div>
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">MCQs · 2 marks each</h3>
            <div className="space-y-3">
              {paper.mcqs.map((mcq, index) => (
                <article key={mcq.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <b className="text-brand">Q{index + 1}</b>
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">{mcq.topicName}</span>
                    {mcq.generated && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">Made from a position</span>}
                    <span className="text-xs text-slate-500">from {mcq.sourceTitle || "homework"}</span>
                    <ReplaceButton busy={busy === mcq.id} disabled={Boolean(busy)} onClick={() => run("replace_question", { slotId: mcq.id }, mcq.id)} />
                  </div>
                  <div className={cn("grid gap-3", mcq.positionFen && "md:grid-cols-[220px_minmax(0,1fr)]")}>
                    {mcq.positionFen && <FenDiagram fen={mcq.positionFen} size={200} />}
                    <div>
                      <QuestionLine
                        question={mcq.question}
                        autoQuestion={mcq.question}
                        disabled={Boolean(busy)}
                        onSave={(question) => run("edit_question", { slotId: mcq.id, question }, `q-${mcq.id}`)}
                      />
                      <ul className="mt-2 grid gap-1">
                        {mcq.options.map((option) => (
                          <li key={option.id} className={cn("rounded-md border px-2 py-1 text-sm", option.correct ? "border-emerald-300 bg-emerald-50 font-bold text-emerald-800" : "border-slate-200 text-slate-700")}>
                            {option.correct && <CheckCircle2 size={13} className="mr-1 inline" />}
                            {option.text}
                          </li>
                        ))}
                      </ul>
                      {mcq.explanation && <p className="mt-2 text-xs text-slate-500">{mcq.explanation}</p>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">Positions · 5 marks each (students see the question and topic, never the solution)</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {paper.positions.map((position, index) => (
                <article key={position.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <b className="text-brand">P{index + 1}</b>
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">{position.topicName}</span>
                    <ReplaceButton busy={busy === position.id} disabled={Boolean(busy)} onClick={() => run("replace_question", { slotId: position.id }, position.id)} />
                  </div>
                  <QuestionLine
                    question={position.question}
                    autoQuestion={position.autoQuestion}
                    disabled={Boolean(busy)}
                    onSave={(question) => run("edit_question", { slotId: position.id, question }, `q-${position.id}`)}
                  />
                  <FenDiagram fen={position.startFen} orientation={position.studentColor} size={220} />
                  <div className="mt-2 text-xs text-slate-600">
                    <div>
                      <b>{position.studentColor === "white" ? "White" : "Black"} to play.</b> Solution: <span className="font-mono">{position.solution.join(" ")}</span>
                    </div>
                    <div className="text-slate-500">{position.title} · from {position.sourceTitle || "homework"}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** The question above a position, editable in place. Clearing it goes back to the automatic line. */
function QuestionLine({ question, autoQuestion, disabled, onSave }: { question: string; autoQuestion: string; disabled: boolean; onSave: (question: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question);
  const [saving, setSaving] = useState(false);

  async function save(value: string) {
    setSaving(true);
    const ok = await onSave(value);
    setSaving(false);
    if (ok) {
      setEditing(false);
      toast.success(value ? "Question saved." : "Question reset to the automatic line.");
    }
  }

  if (!editing) {
    return (
      <div className="mb-2 flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1.5">
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{question}</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft(question);
            setEditing(true);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-brand hover:bg-brand/5 disabled:opacity-50"
          title="Edit the question students see"
        >
          <Pencil size={12} /> Edit
        </button>
      </div>
    );
  }
  return (
    <div className="mb-2 space-y-1.5">
      <textarea className="input min-h-[64px] text-sm" maxLength={240} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="rounded-md bg-brand px-2 py-1 text-xs font-bold text-white disabled:opacity-50" disabled={saving || !draft.trim()} onClick={() => save(draft.trim())}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
        {question !== autoQuestion && (
          <button type="button" className="ml-auto text-xs font-bold text-slate-500 underline" disabled={saving} onClick={() => save("")} title={autoQuestion}>
            Use automatic line
          </button>
        )}
      </div>
    </div>
  );
}

function ReplaceButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-brand hover:bg-brand/5 disabled:opacity-50"
      title="Put a different question from this level's homework in this slot"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />} Replace
    </button>
  );
}

/* ------------------------------------------------------------------ assignments */

function AssignmentsTab({ papers, initialStatus }: { papers: PaperSummary[]; initialStatus: string }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ view: "assignments" });
    if (level) {
      params.set("tier", level.split(":")[0]);
      params.set("level", level.split(":")[1]);
    }
    if (status) params.set("status", status);
    try {
      setRows((await api(`/api/admin/exams?${params}`)).assignments || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [level, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? rows.filter((row) => `${row.student.name} ${row.student.username}`.toLowerCase().includes(term)) : rows;
  }, [rows, q]);

  async function act(body: Record<string, unknown>, success: string) {
    try {
      const data = await postAction(body);
      if (body.action === "assign" && !data.assigned) toast.error(data.skipped?.[0]?.reason || "Not assigned.");
      else toast.success(success);
      await load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
        <input className="input max-w-xs" placeholder="Search student" value={q} onChange={(event) => setQ(event.target.value)} />
        <select className="input max-w-[200px]" value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="">All levels</option>
          {papers.map((paper) => (
            <option key={levelKey(paper.tier, paper.levelNumber)} value={levelKey(paper.tier, paper.levelNumber)}>
              {paper.levelLabel}
            </option>
          ))}
        </select>
        <select className="input max-w-[180px]" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="assigned">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="submitted">Completed</option>
          <option value="expired">Closed without an attempt</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="button" className="btn btn-outline" onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : (
        <ExamResultsTable
          rows={shown}
          actions={(row) => (
            <>
              {row.status === "assigned" && (
                <button
                  type="button"
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                  onClick={() => window.confirm(`Cancel ${row.student.name}'s ${row.levelLabel} exam?`) && void act({ action: "cancel", id: row.id }, "Exam cancelled.")}
                >
                  Cancel exam
                </button>
              )}
              {row.status === "submitted" && row.certificate.status !== "issued" && (
                <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-brand hover:bg-brand/5" onClick={() => void act({ action: "resend_certificate", id: row.id }, "Certificate request sent again.")}>
                  <Send size={12} className="mr-1 inline" /> Resend certificate request
                </button>
              )}
              {["submitted", "expired", "cancelled"].includes(row.status) && (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-brand hover:bg-brand/5"
                  onClick={() =>
                    window.confirm(`Give ${row.student.name} the ${row.levelLabel} exam again? They get a new 7-day window.`) &&
                    void act({ action: "assign", tier: row.tier, level: row.levelNumber, studentIds: [row.student.id] }, "Exam assigned again.")
                  }
                >
                  Assign again
                </button>
              )}
            </>
          )}
        />
      )}
    </section>
  );
}

function AssignDialog({ papers, onClose, onAssigned }: { papers: PaperSummary[]; onClose: () => void; onAssigned: () => void }) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [level, setLevel] = useState(papers[0] ? levelKey(papers[0].tier, papers[0].levelNumber) : "");
  const [mode, setMode] = useState<"students" | "batch" | "classroom">("students");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [batchId, setBatchId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/admin/exams?view=targets")
      .then(setTargets)
      .catch((error) => toast.error(error.message));
  }, []);

  const students = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = targets?.students || [];
    return (term ? list.filter((student) => `${student.name} ${student.username}`.toLowerCase().includes(term)) : list).slice(0, 200);
  }, [targets, q]);

  const ready = level && (mode === "students" ? picked.size > 0 : mode === "batch" ? Boolean(batchId) : Boolean(classroomId));

  async function submit() {
    setSaving(true);
    try {
      const data = await postAction({
        action: "assign",
        tier: level.split(":")[0],
        level: Number(level.split(":")[1]),
        ...(mode === "students" ? { studentIds: Array.from(picked) } : mode === "batch" ? { batchId } : { classroomId }),
      });
      const skipped = data.skipped || [];
      if (data.assigned) toast.success(`Assigned to ${data.assigned} student${data.assigned === 1 ? "" : "s"}. They have been notified.`);
      if (skipped.length) {
        toast.message(`${skipped.length} skipped`, {
          description: skipped.slice(0, 6).map((item: any) => `${item.name || item.student}: ${item.reason}`).join("\n"),
          duration: 10_000,
        });
      }
      if (data.assigned) onAssigned();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-black text-slate-950">Assign an exam</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Level</span>
            <select className="input mt-1" value={level} onChange={(event) => setLevel(event.target.value)}>
              {papers.map((paper) => (
                <option key={levelKey(paper.tier, paper.levelNumber)} value={levelKey(paper.tier, paper.levelNumber)}>
                  {paper.levelLabel} (paper v{paper.version})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">Only published papers can be assigned. The exam stays open for 7 days (until 23:59 IST on the seventh day).</span>
          </label>

          <div className="flex gap-1 rounded-lg bg-slate-50 p-1">
            {(["students", "batch", "classroom"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setMode(value)} className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-bold", mode === value ? "bg-white text-brand shadow-sm" : "text-slate-600")}>
                {value === "students" ? "Students" : value === "batch" ? "Batch" : "Classroom"}
              </button>
            ))}
          </div>

          {!targets && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading students...
            </div>
          )}

          {targets && mode === "students" && (
            <div className="space-y-2">
              <input className="input" placeholder="Search by name or username" value={q} onChange={(event) => setQ(event.target.value)} />
              <div className="text-xs font-semibold text-slate-500">{picked.size} selected</div>
              <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {students.map((student) => (
                  <label key={student.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.has(student.id)}
                      onChange={(event) => {
                        const next = new Set(picked);
                        if (event.target.checked) next.add(student.id);
                        else next.delete(student.id);
                        setPicked(next);
                      }}
                    />
                    <span className="font-semibold text-slate-900">{student.name}</span>
                    <span className="text-xs text-slate-500">{student.username}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {targets && mode === "batch" && (
            <select className="input" value={batchId} onChange={(event) => setBatchId(event.target.value)}>
              <option value="">Choose a batch</option>
              {targets.batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name} ({batch.studentCount} students)
                </option>
              ))}
            </select>
          )}

          {targets && mode === "classroom" && (
            <select className="input" value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>
              <option value="">Choose a classroom</option>
              {targets.classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.title}
                  {classroom.levelName ? ` · ${classroom.levelName}` : ""} ({classroom.studentCount} students{classroom.status === "completed" ? ", completed" : ""})
                </option>
              ))}
            </select>
          )}

          <p className="text-xs text-slate-500">
            Each student and their family get the exam by in-app notification, email and WhatsApp, with reminders 3 days before it closes and on the last morning (08:00 IST). Students who already have this level&apos;s exam open are skipped.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={submit}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Assign
          </button>
        </div>
      </div>
    </div>
  );
}

