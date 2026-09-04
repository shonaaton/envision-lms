"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, CalendarClock, Check, ChevronDown, FileQuestion, FileText, Gamepad2, Search, Trash2, Upload, Users } from "lucide-react";

type ActivityKind = "mcq" | "fen_mcq" | "written_answer" | "fen_written_answer" | "play_computer" | "pgn_quiz";
type PgnSourceMode = "library" | "upload";
type TargetMode = "all" | "batches" | "students";
type QuizOption = { id: string; text: string; correct: boolean };
type AssignmentQuestion = { id: string; text: string; positionFen: string; options: QuizOption[]; explanation: string; expectedAnswer: string };
type PgnDoc = { _id: string; title: string; pgn?: string; folder?: string; white?: string; black?: string; event?: string; initialFen?: string; sideToMove?: "white" | "black" };

type Activity = {
  id: string;
  kind: ActivityKind;
  title: string;
  points: number;
  negativePoints: number;
  timeLimitMinutes: number;
  questions: AssignmentQuestion[];
  minLevel: number;
  maxLevel: number;
  side: "random" | "white" | "black";
  useCustomFen: boolean;
  fen: string;
  useTimeControl: boolean;
  minutes: number;
  increment: number;
  maxAttempts: number;
  pgnSourceMode: PgnSourceMode;
  pgnFolder: string;
  pgnSearch: string;
  selectedPgnIds: string[];
  uploadedPgnTitle: string;
  uploadedPgnText: string;
  uploadedPgnFileName: string;
};

type FolderOption = { value: string; label: string };

const defaultFen = "rn1qkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2";

function makeOption(index: number): QuizOption {
  return { id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`, text: `Option ${index + 1}`, correct: index === 0 };
}

function makeQuestion(index: number, withFen = false, withOptions = true): AssignmentQuestion {
  return {
    id: `question-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: index === 0 ? "What is the best move for White?" : `Question ${index + 1}`,
    positionFen: withFen ? defaultFen : "",
    options: withOptions ? [0, 1, 2, 3].map(makeOption) : [],
    explanation: "",
    expectedAnswer: "",
  };
}

function makeActivity(kind: ActivityKind, index: number): Activity {
  const title =
    kind === "mcq" ? "MCQ"
    : kind === "fen_mcq" ? "FEN + MCQ"
    : kind === "written_answer" ? "Written Answer"
    : kind === "fen_written_answer" ? "FEN + Written Answer"
    : kind === "play_computer" ? "Play vs Computer"
    : "PGN Homework";
  const isMcq = kind === "mcq" || kind === "fen_mcq";
  const isWritten = kind === "written_answer" || kind === "fen_written_answer";
  const hasFen = kind === "fen_mcq" || kind === "fen_written_answer";
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    points: 1,
    negativePoints: 0,
    timeLimitMinutes: 0,
    questions: isMcq || isWritten ? [makeQuestion(0, hasFen, isMcq)] : [],
    minLevel: 1,
    maxLevel: 3,
    side: "random",
    useCustomFen: false,
    fen: defaultFen,
    useTimeControl: false,
    minutes: 10,
    increment: 0,
    maxAttempts: 1,
    pgnSourceMode: "library",
    pgnFolder: "all",
    pgnSearch: "",
    selectedPgnIds: [],
    uploadedPgnTitle: "Uploaded PGN Homework",
    uploadedPgnText: "",
    uploadedPgnFileName: "",
  };
}

function normalizeFolderPath(value?: string | null) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function pgnSideToMoveLabel(pgn: PgnDoc) {
  const fen = pgn.initialFen || (pgn.pgn || "").match(/\[FEN\s+"([^"]+)"\]/)?.[1] || "";
  const side = pgn.sideToMove || (fen.split(/\s+/)[1] === "b" ? "black" : "white");
  return side === "black" ? "Black to play" : "White to play";
}

function splitAssignmentPgns(pgn: string, fallbackTitle: string) {
  const text = pgn.trim();
  if (!text) return [];
  const games = text.split(/\n\s*(?=\[Event\s+")/g).map((item) => item.trim()).filter(Boolean);
  const chunks = games.length ? games : [text];
  return chunks.map((game, index) => {
    const title = game.match(/\[(?:ChapterName|Event)\s+"([^"]+)"\]/)?.[1] || fallbackTitle || `Uploaded PGN ${index + 1}`;
    return { id: `uploaded-${Date.now()}-${index}`, title, pgn: game };
  });
}

async function fetchFullPgn(pgn: PgnDoc): Promise<PgnDoc> {
  if (pgn.pgn) return pgn;
  const response = await fetch(`/api/pgn/${pgn._id}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load PGN "${pgn.title}"`);
  return await response.json() as PgnDoc;
}

export default function NewHomeworkPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [targets, setTargets] = useState<{ students: any[]; batches: any[]; classrooms: any[] }>({ students: [], batches: [], classrooms: [] });
  const [pgns, setPgns] = useState<PgnDoc[]>([]);
  const [classroom, setClassroom] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [assignedStudents, setAssignedStudents] = useState<string[]>([]);
  const [assignedBatches, setAssignedBatches] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [title, setTitle] = useState("Daily Chess Assignment");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [activities, setActivities] = useState<Activity[]>([makeActivity("mcq", 0)]);
  const [openId, setOpenId] = useState(activities[0].id);

  useEffect(() => {
    Promise.all([
      fetch("/api/classrooms", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/homework/targets", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/pgn?limit=5000&summary=1", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([classroomData, targetData, pgnData]) => {
        setClassrooms(Array.isArray(classroomData) ? classroomData : []);
        setTargets({
          students: Array.isArray(targetData?.students) ? targetData.students : [],
          batches: Array.isArray(targetData?.batches) ? targetData.batches : [],
          classrooms: Array.isArray(targetData?.classrooms) ? targetData.classrooms : [],
        });
        setPgns(Array.isArray(pgnData) ? pgnData : []);
      })
      .catch(() => toast.error("Could not load assignment data"));
  }, []);

  const folders = useMemo<FolderOption[]>(() => {
    const unique = Array.from(new Set(pgns.map((pgn) => normalizeFolderPath(pgn.folder) || "Unfiled"))).sort();
    return [{ value: "all", label: "All folders" }, ...unique.map((folder) => ({ value: folder, label: folder === "Unfiled" ? "Unfiled" : folder.replaceAll("/", " / ") }))];
  }, [pgns]);
  const selectedClassroomTarget = targets.classrooms.find((item) => item._id === classroom);
  const classroomStudentIds = new Set((selectedClassroomTarget?.students || []).map((student: any) => student._id));
  const classroomBatchIds = new Set((selectedClassroomTarget?.batches || []).map((batchId: any) => batchId.toString()));
  const assignableBatches = targets.batches.filter((batch) => !classroom || classroomBatchIds.size === 0 || classroomBatchIds.has(batch._id));
  const batchStudentIds = new Set(assignableBatches.flatMap((batch) => (batch.students || []).map((student: any) => student._id)));
  const assignableStudents = targets.students
    .filter((student) => !classroom || classroomStudentIds.has(student._id) || batchStudentIds.has(student._id))
    .filter((student) => `${student.name} ${student.email || ""} ${student.username || ""}`.toLowerCase().includes(studentSearch.toLowerCase()));
  function updateActivity(id: string, patch: Partial<Activity>) {
    setActivities((current) => current.map((activity) => (activity.id === id ? { ...activity, ...patch } : activity)));
  }

  function addActivity(kind: ActivityKind) {
    const activity = makeActivity(kind, activities.length);
    setActivities((current) => [...current, activity]);
    setOpenId(activity.id);
  }

  function removeActivity(id: string) {
    setActivities((current) => {
      const next = current.filter((activity) => activity.id !== id);
      if (openId === id) setOpenId(next[0]?.id || "");
      return next.length ? next : [makeActivity("mcq", 0)];
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!classroom) return toast.error("Choose a classroom");
    if (!activities.length) return toast.error("Add at least one activity");
    const emptyPgnActivity = activities.find((activity) => activity.kind === "pgn_quiz" && activity.selectedPgnIds.length === 0 && splitAssignmentPgns(activity.uploadedPgnText, activity.uploadedPgnTitle).length === 0);
    if (emptyPgnActivity) return toast.error("Add at least one PGN from the library or upload a PGN file.");

    const neededPgnIds = Array.from(new Set(activities.filter((activity) => activity.kind === "pgn_quiz").flatMap((activity) => activity.selectedPgnIds)));
    let fullPgnById = new Map<string, PgnDoc>();
    if (neededPgnIds.length) {
      try {
        const fullDocs = await Promise.all(
          neededPgnIds.map((id) => fetchFullPgn(pgns.find((pgn) => pgn._id === id) || { _id: id, title: "PGN" }))
        );
        fullPgnById = new Map(fullDocs.map((doc) => [doc._id, doc]));
      } catch {
        toast.error("One or more selected PGNs could not be loaded. Please try again.");
        return;
      }
    }

    const assignmentActivities = activities.map((activity) => {
      if (activity.kind === "mcq" || activity.kind === "fen_mcq") {
        return {
          type: "quiz",
          title: activity.title || (activity.kind === "fen_mcq" ? "FEN + MCQ" : "MCQ"),
          instructions: "Answer all multiple-choice questions.",
          points: activity.points,
          timeLimitMinutes: activity.timeLimitMinutes,
          items: activity.questions.map((question, index) => ({
            id: question.id,
            title: `Question ${index + 1}`,
            question: question.text,
            positionFen: question.positionFen,
            options: question.options,
            correctAnswers: question.options.map((option, optionIndex) => (option.correct ? optionIndex : -1)).filter((value) => value >= 0),
            explanation: question.explanation,
            points: activity.points,
          })),
          source: { kind: activity.kind, negativePoints: activity.negativePoints },
        };
      }
      if (activity.kind === "written_answer" || activity.kind === "fen_written_answer") {
        return {
          type: "written_answer",
          title: activity.title || (activity.kind === "fen_written_answer" ? "FEN + Written Answer" : "Written Answer"),
          instructions: "Write your answer in the box. Your coach will review it.",
          points: activity.points,
          timeLimitMinutes: activity.timeLimitMinutes,
          items: activity.questions.map((question, index) => ({
            id: question.id,
            title: `Question ${index + 1}`,
            question: question.text,
            positionFen: question.positionFen,
            expectedAnswer: question.expectedAnswer,
            explanation: question.explanation,
            points: activity.points,
          })),
          source: { kind: activity.kind },
        };
      }
      if (activity.kind === "play_computer") {
        return {
          type: "play_computer",
          title: activity.title || "Play vs Computer",
          instructions: `Play the computer between level ${activity.minLevel} and ${activity.maxLevel}.`,
          points: activity.points,
          timeLimitMinutes: activity.useTimeControl ? activity.minutes : activity.timeLimitMinutes,
          fen: activity.useCustomFen ? activity.fen : defaultFen,
          computer: {
            strength: `Level ${activity.minLevel}-${activity.maxLevel}`,
            rating: activity.maxLevel * 100,
            side: activity.side,
            objective: "Play a practice game",
            timeControl: { type: activity.useTimeControl ? "increment" : "untimed", minutes: activity.useTimeControl ? activity.minutes : 0, increment: activity.useTimeControl ? activity.increment : 0 },
            completion: "Game Finished",
            requiredMoves: 0,
          },
          source: { kind: "play_computer", minLevel: activity.minLevel, maxLevel: activity.maxLevel },
        };
      }
      const selected = pgns.filter((pgn) => activity.selectedPgnIds.includes(pgn._id));
      const uploaded = splitAssignmentPgns(activity.uploadedPgnText, activity.uploadedPgnTitle);
      return {
        type: "study_pgn",
        title: activity.title || "PGN Homework",
        instructions: "Study the selected PGNs and complete the quiz.",
        points: activity.points,
        timeLimitMinutes: activity.timeLimitMinutes,
        source: { kind: "pgn_quiz", folder: activity.pgnFolder, maxAttempts: activity.maxAttempts, sourceMode: activity.pgnSourceMode },
        items: [
          ...selected.map((pgn) => ({
          id: pgn._id,
          title: pgn.title,
          pgnTitle: pgn.title,
          pgnSourceId: pgn._id,
          pgn: fullPgnById.get(pgn._id)?.pgn || pgn.pgn || "",
          source: { kind: "pgn", folder: pgn.folder || "Unfiled" },
          points: activity.points,
          })),
          ...uploaded.map((pgn) => ({
            id: pgn.id,
            title: pgn.title,
            pgnTitle: pgn.title,
            pgn: pgn.pgn,
            source: { kind: "uploaded_pgn", fileName: activity.uploadedPgnFileName || undefined },
            points: activity.points,
          })),
        ],
      };
    });

    const numberOfAttempts = Math.max(1, ...activities.map((activity) => activity.kind === "pgn_quiz" ? activity.maxAttempts : 1));
    const timeLimitMinutes = Math.max(0, ...activities.map((activity) => activity.timeLimitMinutes || 0));
    const response = await fetch("/api/homework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classroom,
        title,
        description,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        numberOfAttempts,
        timeLimitMinutes,
        assignAllStudents: targetMode === "all",
        assignedStudents: targetMode === "students" ? assignedStudents : [],
        assignedBatches: targetMode === "batches" ? assignedBatches : [],
        activities: assignmentActivities,
        puzzles: [],
      }),
    });
    if (!response.ok) return toast.error("Failed to create assignment");
    toast.success("Assignment created");
    router.push("/homework");
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-3 text-slate-950 sm:p-4">
      <header className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-black text-brand">Create Assignment</h1>
          <p className="text-xs text-slate-500">Build MCQ, written answer, board-based, PGN, and computer-play homework.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/instructor/homework/templates/new" className="inline-flex h-9 items-center justify-center rounded-lg border border-brand/20 px-3 text-xs font-black text-brand">Create Template</Link>
          <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-black text-white"><Check size={14} /> Create Assignment</button>
        </div>
      </header>

      <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1.2fr_1fr_1fr]">
        <label className="text-xs font-bold text-slate-600">
          Assignment title
          <input className="input mt-1 h-9" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Classroom
          <select className="input mt-1 h-9" value={classroom} onChange={(event) => setClassroom(event.target.value)} required>
            <option value="">Choose classroom</option>
            {classrooms.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Due date
          <span className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3">
            <CalendarClock size={14} className="text-brand" />
            <input className="min-w-0 flex-1 outline-none" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </span>
        </label>
        <label className="text-xs font-bold text-slate-600 lg:col-span-3">
          Description
          <textarea className="input mt-1 h-10 resize-none" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-black text-brand"><Users size={15} /> Assign To</div>
        <div className="flex flex-wrap gap-2">
          {(["all", "batches", "students"] as TargetMode[]).map((mode) => (
            <button key={mode} type="button" className={`rounded-full px-3 py-1.5 text-xs font-bold ${targetMode === mode ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`} onClick={() => setTargetMode(mode)}>
              {mode === "all" ? "Entire class" : mode === "batches" ? "Batches" : "Specific students"}
            </button>
          ))}
        </div>
        {targetMode === "batches" && (
          <div className="grid gap-2 md:grid-cols-3">
            {assignableBatches.map((batch) => <CheckboxRow key={batch._id} label={batch.name} checked={assignedBatches.includes(batch._id)} onChange={() => toggleId(batch._id, assignedBatches, setAssignedBatches)} />)}
          </div>
        )}
        {targetMode === "students" && (
          <div>
            <div className="mb-3 flex max-w-md items-center gap-2 rounded-lg border border-slate-200 px-3">
              <Search size={15} className="text-slate-400" />
              <input className="h-10 flex-1 outline-none" placeholder="Search students" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} />
            </div>
            <div className="grid max-h-56 gap-2 overflow-y-auto md:grid-cols-3">
              {assignableStudents.map((student) => <CheckboxRow key={student._id} label={student.name} sub={student.username || student.email} checked={assignedStudents.includes(student._id)} onChange={() => toggleId(student._id, assignedStudents, setAssignedStudents)} />)}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-brand">Activities</h2>
            <p className="text-xs text-slate-500">Add one or more activities students must complete.</p>
          </div>
          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">{activities.length} activit{activities.length === 1 ? "y" : "ies"}</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <AddActivityButton icon={<FileQuestion size={15} />} label="Add MCQ" onClick={() => addActivity("mcq")} />
          <AddActivityButton icon={<FileQuestion size={15} />} label="Add FEN + MCQ" onClick={() => addActivity("fen_mcq")} />
          <AddActivityButton icon={<FileText size={15} />} label="Add Written Answer" onClick={() => addActivity("written_answer")} />
          <AddActivityButton icon={<FileText size={15} />} label="Add FEN + Written" onClick={() => addActivity("fen_written_answer")} />
          <AddActivityButton icon={<Gamepad2 size={15} />} label="Add Play vs Computer" onClick={() => addActivity("play_computer")} />
          <AddActivityButton icon={<BookOpen size={15} />} label="Add PGN Homework" onClick={() => addActivity("pgn_quiz")} />
        </div>

        <div className="space-y-3">
          {activities.map((activity, index) => (
            <ActivityCard
              key={activity.id}
              index={index}
              activity={activity}
              open={openId === activity.id}
              pgns={pgns}
              folders={folders}
              onToggle={() => setOpenId(openId === activity.id ? "" : activity.id)}
              onRemove={() => removeActivity(activity.id)}
              onChange={(patch) => updateActivity(activity.id, patch)}
            />
          ))}
        </div>
      </section>
    </form>
  );
}

function ActivityCard({ activity, index, open, pgns, folders, onToggle, onRemove, onChange }: {
  activity: Activity;
  index: number;
  open: boolean;
  pgns: PgnDoc[];
  folders: FolderOption[];
  onToggle: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<Activity>) => void;
}) {
  const filteredPgns = pgns.filter((pgn) => activity.pgnFolder === "all" || (normalizeFolderPath(pgn.folder) || "Unfiled") === activity.pgnFolder);
  const isMcq = activity.kind === "mcq" || activity.kind === "fen_mcq";
  const isWritten = activity.kind === "written_answer" || activity.kind === "fen_written_answer";
  const summary = isMcq
    ? `${activity.questions.length} question${activity.questions.length === 1 ? "" : "s"}`
    : isWritten
      ? `${activity.questions.length} written response${activity.questions.length === 1 ? "" : "s"}`
    : activity.kind === "play_computer"
      ? `Level ${activity.minLevel}-${activity.maxLevel} · ${activity.side === "random" ? "Any color" : activity.side}`
      : `${activity.selectedPgnIds.length} game${activity.selectedPgnIds.length === 1 ? "" : "s"} selected`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left" onClick={onToggle}>
        <div>
          <div className="text-xs text-slate-500">Activity {index + 1}</div>
          <div className="font-black text-slate-950">{activity.title}</div>
          <div className="text-xs text-slate-500">{summary}</div>
        </div>
        <div className="flex items-center gap-2">
          {activitiesCanDelete(index) && <span role="button" tabIndex={0} className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={(event) => { event.stopPropagation(); onRemove(); }}><Trash2 size={15} /></span>}
          <ChevronDown size={18} className={`transition ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-3">
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <label className="text-xs font-bold text-slate-600">
              Activity title
              <input className="input mt-1 h-9" value={activity.title} onChange={(event) => onChange({ title: event.target.value })} />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Points
              <input className="input mt-1 h-9" type="number" min={0} value={activity.points} onChange={(event) => onChange({ points: Number(event.target.value) })} />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Time limit in minutes
              <input className="input mt-1 h-9" type="number" min={0} placeholder="0 means no limit" value={activity.timeLimitMinutes} onChange={(event) => onChange({ timeLimitMinutes: Number(event.target.value) })} />
            </label>
          </div>
          {isMcq && <McqActivity activity={activity} onChange={onChange} />}
          {isWritten && <WrittenAnswerActivity activity={activity} onChange={onChange} />}
          {activity.kind === "play_computer" && <ComputerActivity activity={activity} onChange={onChange} />}
          {activity.kind === "pgn_quiz" && <PgnQuizActivity activity={activity} pgns={filteredPgns} folders={folders} onChange={onChange} />}
        </div>
      )}
    </div>
  );
}

function McqActivity({ activity, onChange }: { activity: Activity; onChange: (patch: Partial<Activity>) => void }) {
  function updateQuestion(id: string, patch: Partial<AssignmentQuestion>) {
    onChange({ questions: activity.questions.map((question) => (question.id === id ? { ...question, ...patch } : question)) });
  }
  function updateOption(question: AssignmentQuestion, optionId: string, patch: Partial<QuizOption>) {
    updateQuestion(question.id, { options: question.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)) });
  }
  return (
    <div className="space-y-4">
      <label className="block text-xs font-bold text-slate-600">
        Negative points
        <input className="input mt-1 h-10 max-w-md" type="number" min={0} value={activity.negativePoints} onChange={(event) => onChange({ negativePoints: Number(event.target.value) })} />
      </label>
      {activity.questions.map((question, questionIndex) => (
        <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black text-brand">Question {questionIndex + 1}</h3>
            {activity.questions.length > 1 && <button type="button" className="text-red-500" onClick={() => onChange({ questions: activity.questions.filter((item) => item.id !== question.id) })}><Trash2 size={16} /></button>}
          </div>
          <label className="text-xs font-bold text-slate-600">
            Question text
            <textarea className="input mt-1 h-20 resize-none" placeholder="e.g. What is the best move for White?" value={question.text} onChange={(event) => updateQuestion(question.id, { text: event.target.value })} />
          </label>
          <label className="mt-3 block text-xs font-bold text-slate-600">
            Chess position for this question
            <textarea className="input mt-1 h-16 resize-none font-mono text-xs" placeholder="Optional FEN. Leave empty for a text-only question." value={question.positionFen} onChange={(event) => updateQuestion(question.id, { positionFen: event.target.value })} />
          </label>
          <div className="mt-3 space-y-2">
            <div className="text-xs font-bold text-slate-600">Options. Select the correct answer.</div>
            {question.options.map((option) => (
              <div key={option.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2">
                <input type="radio" checked={option.correct} onChange={() => updateQuestion(question.id, { options: question.options.map((item) => ({ ...item, correct: item.id === option.id })) })} />
                <input className="input h-10" value={option.text} onChange={(event) => updateOption(question, option.id, { text: event.target.value })} />
                <button type="button" className="rounded-lg p-2 text-red-500" onClick={() => updateQuestion(question.id, { options: question.options.filter((item) => item.id !== option.id) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={() => updateQuestion(question.id, { options: [...question.options, makeOption(question.options.length)] })}>+ Add option</button>
          </div>
          <label className="mt-3 block text-xs font-bold text-slate-600">
            Explanation
            <textarea className="input mt-1 h-16 resize-none" placeholder="Explain why the correct answer is right" value={question.explanation} onChange={(event) => updateQuestion(question.id, { explanation: event.target.value })} />
          </label>
        </div>
      ))}
      <button type="button" className="rounded-lg border border-dashed border-brand/30 px-4 py-2 text-sm font-black text-brand" onClick={() => onChange({ questions: [...activity.questions, makeQuestion(activity.questions.length, activity.kind === "fen_mcq", true)] })}>+ Add question</button>
    </div>
  );
}

function WrittenAnswerActivity({ activity, onChange }: { activity: Activity; onChange: (patch: Partial<Activity>) => void }) {
  function updateQuestion(id: string, patch: Partial<AssignmentQuestion>) {
    onChange({ questions: activity.questions.map((question) => (question.id === id ? { ...question, ...patch } : question)) });
  }
  return (
    <div className="space-y-4">
      {activity.questions.map((question, questionIndex) => (
        <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black text-brand">Question {questionIndex + 1}</h3>
            {activity.questions.length > 1 && <button type="button" className="text-red-500" onClick={() => onChange({ questions: activity.questions.filter((item) => item.id !== question.id) })}><Trash2 size={16} /></button>}
          </div>
          <label className="text-xs font-bold text-slate-600">
            Question text
            <textarea className="input mt-1 h-20 resize-none" placeholder="e.g. Explain why this move wins material." value={question.text} onChange={(event) => updateQuestion(question.id, { text: event.target.value })} />
          </label>
          <label className="mt-3 block text-xs font-bold text-slate-600">
            Chess position for this question
            <textarea className="input mt-1 h-16 resize-none font-mono text-xs" placeholder="Optional FEN. Leave empty for a text-only question." value={question.positionFen} onChange={(event) => updateQuestion(question.id, { positionFen: event.target.value })} />
          </label>
          <label className="mt-3 block text-xs font-bold text-slate-600">
            Model answer for coach reference
            <textarea className="input mt-1 h-20 resize-none" placeholder="Optional. Students will not be auto-marked from this." value={question.expectedAnswer} onChange={(event) => updateQuestion(question.id, { expectedAnswer: event.target.value })} />
          </label>
          <label className="mt-3 block text-xs font-bold text-slate-600">
            Explanation / review note
            <textarea className="input mt-1 h-16 resize-none" placeholder="Optional explanation shown after submission." value={question.explanation} onChange={(event) => updateQuestion(question.id, { explanation: event.target.value })} />
          </label>
        </div>
      ))}
      <button type="button" className="rounded-lg border border-dashed border-brand/30 px-4 py-2 text-sm font-black text-brand" onClick={() => onChange({ questions: [...activity.questions, makeQuestion(activity.questions.length, activity.kind === "fen_written_answer", false)] })}>+ Add question</button>
    </div>
  );
}

function ComputerActivity({ activity, onChange }: { activity: Activity; onChange: (patch: Partial<Activity>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">
          Min level
          <input className="input mt-1 h-10" type="number" min={1} max={12} value={activity.minLevel} onChange={(event) => onChange({ minLevel: Number(event.target.value) })} />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Max level
          <input className="input mt-1 h-10" type="number" min={1} max={12} value={activity.maxLevel} onChange={(event) => onChange({ maxLevel: Number(event.target.value) })} />
        </label>
      </div>
      <div>
        <div className="mb-2 text-xs font-bold text-slate-600">Player color</div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["random", "white", "black"] as const).map((side) => <label key={side} className="flex items-center gap-2 capitalize"><input type="radio" checked={activity.side === side} onChange={() => onChange({ side })} />{side === "random" ? "Any color" : side}</label>)}
        </div>
      </div>
      <Toggle label="Use custom starting position" checked={activity.useCustomFen} onChange={(checked) => onChange({ useCustomFen: checked })} />
      {activity.useCustomFen && <textarea className="input h-20 resize-none font-mono text-xs" value={activity.fen} onChange={(event) => onChange({ fen: event.target.value })} />}
      <Toggle label="Require specific time control" checked={activity.useTimeControl} onChange={(checked) => onChange({ useTimeControl: checked })} />
      {activity.useTimeControl && (
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input h-10" type="number" min={0} value={activity.minutes} onChange={(event) => onChange({ minutes: Number(event.target.value) })} />
          <input className="input h-10" type="number" min={0} value={activity.increment} onChange={(event) => onChange({ increment: Number(event.target.value) })} />
        </div>
      )}
    </div>
  );
}

function PgnQuizActivity({ activity, pgns, folders, onChange }: { activity: Activity; pgns: PgnDoc[]; folders: FolderOption[]; onChange: (patch: Partial<Activity>) => void }) {
  const searchablePgns = pgns.filter((pgn) => `${pgn.title} ${pgn.white || ""} ${pgn.black || ""} ${pgn.folder || ""}`.toLowerCase().includes(activity.pgnSearch.toLowerCase()));
  const allSelected = searchablePgns.length > 0 && searchablePgns.every((pgn) => activity.selectedPgnIds.includes(pgn._id));
  const uploadedChapters = splitAssignmentPgns(activity.uploadedPgnText, activity.uploadedPgnTitle);
  function readUploadedPgn(file?: File) {
    if (!file) return;
    file.text()
      .then((text) => onChange({ uploadedPgnText: text, uploadedPgnFileName: file.name, uploadedPgnTitle: activity.uploadedPgnTitle || file.name.replace(/\.pgn$/i, "") }))
      .catch(() => toast.error("Could not read PGN file"));
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">
          Maximum attempts
          <input className="input mt-1 h-9" type="number" min={1} value={activity.maxAttempts} onChange={(event) => onChange({ maxAttempts: Number(event.target.value) })} />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Selected games
          <div className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold">{activity.selectedPgnIds.length + uploadedChapters.length} total</div>
        </label>
        <div className="flex items-end">
          <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(["library", "upload"] as PgnSourceMode[]).map((mode) => (
              <button key={mode} type="button" className={`rounded-md px-3 text-xs font-black ${activity.pgnSourceMode === mode ? "bg-brand text-white shadow-sm" : "text-slate-600"}`} onClick={() => onChange({ pgnSourceMode: mode })}>
                {mode === "library" ? "Library" : "Upload PGN"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activity.pgnSourceMode === "library" && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(180px,260px)_auto] md:items-end">
            <label className="text-xs font-bold text-slate-600">
              Search library
              <span className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                <Search size={14} className="text-slate-400" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search PGN, player, folder" value={activity.pgnSearch} onChange={(event) => onChange({ pgnSearch: event.target.value })} />
              </span>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Folder
              <select className="input mt-1 h-9 bg-white" value={activity.pgnFolder} onChange={(event) => onChange({ pgnFolder: event.target.value, selectedPgnIds: [] })}>
                {folders.map((folder) => <option key={folder.value} value={folder.value}>{folder.label}</option>)}
              </select>
            </label>
            <button type="button" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700" onClick={() => onChange({ selectedPgnIds: allSelected ? activity.selectedPgnIds.filter((id) => !searchablePgns.some((pgn) => pgn._id === id)) : Array.from(new Set([...activity.selectedPgnIds, ...searchablePgns.map((pgn) => pgn._id)])) })}>
              {allSelected ? "Clear shown" : "Select shown"}
            </button>
          </div>
          <div className="grid max-h-64 gap-2 overflow-y-auto md:grid-cols-2">
            {searchablePgns.map((pgn) => <CheckboxRow key={pgn._id} label={pgn.title} sub={`${normalizeFolderPath(pgn.folder) || "Unfiled"} - ${pgn.white || "White"} vs ${pgn.black || "Black"} - ${pgnSideToMoveLabel(pgn)}`} checked={activity.selectedPgnIds.includes(pgn._id)} onChange={() => toggleId(pgn._id, activity.selectedPgnIds, (selectedPgnIds) => onChange({ selectedPgnIds }))} />)}
            {!searchablePgns.length && <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">No PGNs found for this selection.</div>}
          </div>
        </div>
      )}

      {activity.pgnSourceMode === "upload" && (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600">
              Title
              <input className="input mt-1 h-9 bg-white" value={activity.uploadedPgnTitle} onChange={(event) => onChange({ uploadedPgnTitle: event.target.value })} />
            </label>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand/30 bg-white p-3 text-center text-sm font-bold text-brand">
              <Upload size={20} />
              <span className="mt-1">{activity.uploadedPgnFileName || "Upload .pgn file"}</span>
              <input className="hidden" type="file" accept=".pgn" onChange={(event) => readUploadedPgn(event.target.files?.[0])} />
            </label>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
              {uploadedChapters.length ? `${uploadedChapters.length} chapter${uploadedChapters.length === 1 ? "" : "s"} ready` : "Paste or upload a PGN"}
            </div>
          </div>
          <label className="text-xs font-bold text-slate-600">
            PGN content
            <textarea className="input mt-1 min-h-44 resize-y bg-white font-mono text-xs" placeholder="Paste PGN here..." value={activity.uploadedPgnText} onChange={(event) => onChange({ uploadedPgnText: event.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}

function AddActivityButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand/20 bg-white px-3 text-xs font-black text-brand hover:bg-brand/5" onClick={onClick}>{icon}{label}</button>;
}

function CheckboxRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span><b>{label}</b>{sub && <span className="block text-xs text-slate-500">{sub}</span>}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function toggleId(id: string, current: string[], setter: (value: string[]) => void) {
  setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
}

function activitiesCanDelete(index: number) {
  return index >= 0;
}
