"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { toast } from "sonner";
import {
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  FileQuestion,
  Filter,
  Gamepad2,
  GraduationCap,
  Library,
  ListChecks,
  Plus,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  Users,
} from "lucide-react";

type ActivityType =
  | "solve_position"
  | "quiz"
  | "play_computer"
  | "find_best_move"
  | "find_combination"
  | "study_pgn"
  | "analyze_position"
  | "endgame_practice"
  | "opening_practice";

type Difficulty = "beginner" | "intermediate" | "advanced";
type LibraryMode = "sets" | "pgn";
type TargetMode = "all" | "batches" | "students";

type QuizOption = { id: string; text: string; correct: boolean };
type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  instructions: string;
  difficulty: Difficulty;
  points: number;
  timeLimitMinutes: number;
  topic?: string;
  opening?: string;
  endgame?: string;
  tacticalTheme?: string;
  tags?: string[];
  fen?: string;
  solution: string;
  pgn?: string;
  pgnTitle?: string;
  pgnSourceId?: string;
  source?: Record<string, unknown>;
  quiz?: {
    question: string;
    options: QuizOption[];
    multipleCorrect: boolean;
    explanation: string;
    positionFen?: string;
  };
  computer?: {
    strength: string;
    rating: number;
    side: "white" | "black" | "random";
    objective: string;
    timeControl: { type: "untimed" | "fixed" | "increment"; minutes: number; increment: number };
    completion: string;
    requiredMoves: number;
  };
};

type ActivityPack = {
  id: string;
  name: string;
  description: string;
  activities: Activity[];
  type: ActivityType | "mixed";
  difficulty: Difficulty | "mixed";
  topic?: string;
  createdAt: string;
};

type PgnDoc = {
  _id: string;
  title: string;
  pgn: string;
  folder?: string;
  white?: string;
  black?: string;
  event?: string;
  result?: string;
};

type PgnPosition = { moveNumber: number; ply: number; san: string; fen: string };

const storageKey = "assignment-activity-sets-v2";
const startFen = "rn1qkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2";

const activityTypes: { id: ActivityType; label: string; note: string; icon: React.ReactNode }[] = [
  { id: "solve_position", label: "Solve Position", note: "Students solve from a FEN.", icon: <Target size={15} /> },
  { id: "quiz", label: "Quiz", note: "Text or chess-position MCQ.", icon: <FileQuestion size={15} /> },
  { id: "play_computer", label: "Play Computer", note: "Practice against engine settings.", icon: <Gamepad2 size={15} /> },
  { id: "find_best_move", label: "Find Best Move", note: "Single strongest move.", icon: <Sparkles size={15} /> },
  { id: "find_combination", label: "Find Combination", note: "Multi-move tactic sequence.", icon: <ListChecks size={15} /> },
  { id: "study_pgn", label: "Study PGN", note: "Review a whole game or chapter.", icon: <BookOpen size={15} /> },
  { id: "analyze_position", label: "Analyze Position", note: "Student writes evaluation.", icon: <Brain size={15} /> },
  { id: "endgame_practice", label: "Endgame Practice", note: "Convert or defend endings.", icon: <GraduationCap size={15} /> },
  { id: "opening_practice", label: "Opening Practice", note: "Practice opening tabiyas.", icon: <Library size={15} /> },
];

const defaultOptions: QuizOption[] = [
  { id: "a", text: "Nf3", correct: true },
  { id: "b", text: "Qh5", correct: false },
  { id: "c", text: "Bc4", correct: false },
  { id: "d", text: "O-O", correct: false },
];

function makeActivity(type: ActivityType, seed: Partial<Activity> = {}): Activity {
  const label = activityTypes.find((item) => item.id === type)?.label || "Activity";
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: seed.title || label,
    instructions: seed.instructions || "",
    difficulty: seed.difficulty || "beginner",
    points: seed.points ?? 1,
    timeLimitMinutes: seed.timeLimitMinutes ?? 0,
    fen: seed.fen ?? (type === "study_pgn" ? "" : startFen),
    solution: seed.solution || "",
    topic: seed.topic || "",
    opening: seed.opening || "",
    endgame: seed.endgame || "",
    tacticalTheme: seed.tacticalTheme || "",
    tags: seed.tags || [],
    pgn: seed.pgn || "",
    pgnTitle: seed.pgnTitle || "",
    pgnSourceId: seed.pgnSourceId || "",
    source: seed.source,
    quiz:
      seed.quiz ||
      (type === "quiz"
        ? {
            question: "What is the best move?",
            options: defaultOptions,
            multipleCorrect: false,
            explanation: "",
            positionFen: "",
          }
        : undefined),
    computer:
      seed.computer ||
      (type === "play_computer" || type === "endgame_practice" || type === "opening_practice"
        ? {
            strength: "Beginner",
            rating: 500,
            side: "white",
            objective: type === "endgame_practice" ? "Convert Winning Position" : type === "opening_practice" ? "Practice Opening" : "Win the Game",
            timeControl: { type: "untimed", minutes: 0, increment: 0 },
            completion: "Game Finished",
            requiredMoves: 0,
          }
        : undefined),
  };
}

const starterPacks: ActivityPack[] = [
  {
    id: "tactics-and-quiz",
    name: "Tactics + Checkpoint Quiz",
    description: "A reusable block with a best-move task and one chess MCQ.",
    type: "mixed",
    difficulty: "beginner",
    createdAt: new Date().toISOString(),
    activities: [
      makeActivity("find_best_move", {
        title: "Find the forcing move",
        instructions: "Look for checks and forcing threats first.",
        fen: "6k1/5ppp/8/8/8/5Q2/5PPP/6K1 w - - 0 1",
        solution: "Qa8+",
        points: 2,
        tacticalTheme: "forcing move",
      }),
      makeActivity("quiz", {
        title: "Piece value check",
        points: 1,
        quiz: {
          question: "Which piece is worth 9 points?",
          options: [
            { id: "a", text: "Bishop", correct: false },
            { id: "b", text: "Knight", correct: false },
            { id: "c", text: "Queen", correct: true },
            { id: "d", text: "Rook", correct: false },
          ],
          multipleCorrect: false,
          explanation: "The queen is normally valued at 9 points.",
        },
      }),
    ],
  },
  {
    id: "engine-endgame",
    name: "Endgame Engine Practice",
    description: "A king and pawn position plus a computer-practice completion rule.",
    type: "endgame_practice",
    difficulty: "beginner",
    createdAt: new Date().toISOString(),
    activities: [
      makeActivity("endgame_practice", {
        title: "Convert the pawn ending",
        instructions: "Play against the computer and try to convert the extra pawn.",
        fen: "8/8/8/3k4/8/3K4/4P3/8 w - - 0 1",
        points: 3,
        computer: {
          strength: "Beginner",
          rating: 600,
          side: "white",
          objective: "Convert Winning Position",
          timeControl: { type: "untimed", minutes: 0, increment: 0 },
          completion: "Win Required",
          requiredMoves: 0,
        },
      }),
    ],
  },
];

export default function NewHomeworkPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [targets, setTargets] = useState<{ students: any[]; batches: any[]; classrooms: any[] }>({ students: [], batches: [], classrooms: [] });
  const [classroom, setClassroom] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [assignedStudents, setAssignedStudents] = useState<string[]>([]);
  const [assignedBatches, setAssignedBatches] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [title, setTitle] = useState("Knight Vision: Daily Practice");
  const [description, setDescription] = useState("Solve, study, or play each activity carefully. Write down the idea before moving.");
  const [dueAt, setDueAt] = useState("");
  const [activities, setActivities] = useState<Activity[]>([makeActivity("solve_position")]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedPacks, setSavedPacks] = useState<ActivityPack[]>([]);
  const [packName, setPackName] = useState("");
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("sets");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryType, setLibraryType] = useState<ActivityType | "all">("all");
  const [pgns, setPgns] = useState<PgnDoc[]>([]);
  const [pgnFolder, setPgnFolder] = useState("all");
  const [selectedPgnId, setSelectedPgnId] = useState("");
  const [selectedPgnPositions, setSelectedPgnPositions] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/classrooms").then((r) => r.json()),
      fetch("/api/homework/targets").then((r) => r.json()),
      fetch("/api/pgn").then((r) => r.json()),
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

    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ActivityPack[];
        if (Array.isArray(parsed)) setSavedPacks(parsed);
      } catch {
        // Optional local library.
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(savedPacks));
  }, [savedPacks]);

  const activeActivity = activities[activeIndex] || activities[0];
  const selectedPgn = pgns.find((pgn) => pgn._id === selectedPgnId) || null;
  const pgnPositions = useMemo(() => (selectedPgn ? extractPgnPositions(selectedPgn.pgn) : []), [selectedPgn]);
  const pgnFolders = useMemo(() => ["all", ...Array.from(new Set(pgns.map((pgn) => pgn.folder || "Unfiled"))).sort()], [pgns]);

  const visiblePgns = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return pgns.filter((pgn) => {
      const folder = pgn.folder || "Unfiled";
      const matchesFolder = pgnFolder === "all" || folder === pgnFolder || folder.startsWith(`${pgnFolder}/`);
      const haystack = `${pgn.title} ${pgn.white || ""} ${pgn.black || ""} ${pgn.event || ""} ${folder}`.toLowerCase();
      return matchesFolder && (!query || haystack.includes(query));
    });
  }, [libraryQuery, pgnFolder, pgns]);

  const visiblePacks = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return [...savedPacks, ...starterPacks].filter((pack) => {
      const matchesType = libraryType === "all" || pack.type === libraryType || pack.activities.some((activity) => activity.type === libraryType);
      const haystack = `${pack.name} ${pack.description} ${pack.topic || ""}`.toLowerCase();
      return matchesType && (!query || haystack.includes(query));
    });
  }, [libraryQuery, libraryType, savedPacks]);

  const selectedClassroomTarget = targets.classrooms.find((item) => item._id === classroom);
  const classroomStudentIds = new Set((selectedClassroomTarget?.students || []).map((student: any) => student._id));
  const classroomBatchIds = new Set((selectedClassroomTarget?.batches || []).map((batchId: any) => batchId.toString()));
  const assignableBatches = targets.batches.filter((batch) => !classroom || classroomBatchIds.size === 0 || classroomBatchIds.has(batch._id));
  const batchStudentIds = new Set(assignableBatches.flatMap((batch) => (batch.students || []).map((student: any) => student._id)));
  const assignableStudents = targets.students
    .filter((student) => !classroom || classroomStudentIds.has(student._id) || batchStudentIds.has(student._id))
    .filter((student) => `${student.name} ${student.email || ""} ${student.username || ""}`.toLowerCase().includes(studentSearch.toLowerCase()));

  const totalPoints = useMemo(() => activities.reduce((sum, item) => sum + (Number(item.points) || 0), 0), [activities]);
  const readyCount = activities.filter(isActivityReady).length;

  function updateActivity(index: number, patch: Partial<Activity>) {
    setActivities((current) => current.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  function replaceActiveType(type: ActivityType) {
    const existing = activeActivity;
    updateActivity(activeIndex, makeActivity(type, { title: activityTypes.find((item) => item.id === type)?.label || existing.title, points: existing.points }));
  }

  function addActivity(type: ActivityType = "solve_position", seed: Partial<Activity> = {}) {
    setActivities((current) => {
      const next = [...current, makeActivity(type, seed)];
      setActiveIndex(next.length - 1);
      return next;
    });
  }

  function removeActivity(index: number) {
    setActivities((current) => {
      const next = current.filter((_, idx) => idx !== index);
      setActiveIndex(Math.max(0, Math.min(activeIndex, next.length - 1)));
      return next.length ? next : [makeActivity("solve_position")];
    });
  }

  function loadPack(pack: ActivityPack) {
    setActivities(pack.activities.map((activity) => ({ ...activity, id: `${activity.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })));
    setActiveIndex(0);
    toast.success(`${pack.name} loaded`);
  }

  function savePack() {
    const name = packName.trim() || title.trim();
    if (!name) return toast.error("Add a name for this activity set");
    const uniqueTypes = Array.from(new Set(activities.map((activity) => activity.type)));
    const uniqueDifficulties = Array.from(new Set(activities.map((activity) => activity.difficulty)));
    const pack: ActivityPack = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name,
      description: description || "Saved reusable activity set",
      activities,
      type: uniqueTypes.length === 1 ? uniqueTypes[0] : "mixed",
      difficulty: uniqueDifficulties.length === 1 ? uniqueDifficulties[0] : "mixed",
      topic: activities.find((activity) => activity.topic)?.topic || "",
      createdAt: new Date().toISOString(),
    };
    setSavedPacks((current) => [pack, ...current].slice(0, 18));
    setPackName("");
    toast.success("Activity set saved");
  }

  function importEntirePgn(pgn: PgnDoc) {
    addActivity("study_pgn", {
      title: pgn.title,
      instructions: "Review this PGN and answer the coach's follow-up questions.",
      pgn: pgn.pgn,
      pgnTitle: pgn.title,
      pgnSourceId: pgn._id,
      source: { kind: "pgn", pgnId: pgn._id, folder: pgn.folder || "Unfiled" },
      points: 2,
    });
    toast.success("PGN imported as a study activity");
  }

  function importPgnPositions(pgn: PgnDoc, positions: PgnPosition[]) {
    if (!positions.length) return toast.error("Select at least one position");
    setActivities((current) => [
      ...current,
      ...positions.map((position) =>
        makeActivity("solve_position", {
          title: `${pgn.title}: Move ${position.moveNumber}`,
          instructions: `Find the next idea after ${position.san}.`,
          fen: position.fen,
          pgnTitle: pgn.title,
          pgnSourceId: pgn._id,
          source: { kind: "pgn_position", pgnId: pgn._id, folder: pgn.folder || "Unfiled", moveNumber: position.moveNumber, san: position.san },
          points: 1,
        })
      ),
    ]);
    setActiveIndex(activities.length);
    setSelectedPgnPositions([]);
    toast.success(`${positions.length} PGN position${positions.length === 1 ? "" : "s"} imported`);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!classroom) return toast.error("Choose a classroom");
    if (!activities.length) return toast.error("Add at least one activity");

    const assignAllStudents = targetMode === "all";
    const payload = {
      classroom,
      title,
      description,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      assignAllStudents,
      assignedStudents: targetMode === "students" ? assignedStudents : [],
      assignedBatches: targetMode === "batches" ? assignedBatches : [],
      activities: activities.map(toPayloadActivity),
      puzzles: activities
        .filter((activity) => ["solve_position", "find_best_move", "find_combination"].includes(activity.type) && activity.fen)
        .map((activity) => ({
          fen: activity.fen || "",
          prompt: activity.instructions || activity.title,
          points: Number(activity.points) || 1,
          solution: activity.solution.trim().split(/\s+/).filter(Boolean),
        })),
    };
    const response = await fetch("/api/homework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return toast.error("Failed to create assignment");
    toast.success("Assignment created");
    router.push("/homework");
  }

  return (
    <form onSubmit={submit} className="h-[calc(100vh-112px)] overflow-hidden rounded-3xl border border-brand/10 bg-white/95 p-4 text-slate-950 shadow-2xl shadow-brand-900/10 backdrop-blur">
      <header className="mb-4 flex flex-col gap-3 border-b border-brand/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand/70">
            <Sparkles size={14} className="text-accent-500" /> Mission Builder
          </div>
          <h1 className="mt-1 text-3xl font-black text-brand">Create Assignment</h1>
          <p className="text-sm text-slate-500">Build chess practice from PGNs, positions, quizzes, and engine activities without a long scrolling form.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={savePack}><Save size={16} /> Save Activity Set</button>
          <button className="btn-primary"><Check size={16} /> Create Assignment</button>
        </div>
      </header>

      <div className="grid h-[calc(100%-92px)] min-h-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <section className="min-h-0 overflow-y-auto rounded-2xl border border-brand/10 bg-[#fbf7ff] p-4">
          <PanelTitle icon={<ClipboardList size={17} />} title="Brief & Assign To" />
          <div className="mt-4 space-y-3">
            <label className="text-xs font-bold text-slate-600">
              Classroom
              <select className="input mt-1 h-11" value={classroom} onChange={(event) => setClassroom(event.target.value)} required>
                <option value="">Choose classroom</option>
                {classrooms.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Assignment Name
              <input className="input mt-1 h-11" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Coach Notes
              <textarea className="input mt-1 h-20 resize-none" value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Due Date
              <span className="mt-1 flex h-11 items-center gap-2 rounded-lg border border-brand/10 bg-white px-3 shadow-sm">
                <CalendarClock size={16} className="text-brand" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </span>
            </label>

            <div className="rounded-2xl border border-brand/10 bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-brand"><Users size={16} /> Assign To</div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
                {(["all", "batches", "students"] as TargetMode[]).map((mode) => (
                  <button key={mode} type="button" className={`rounded-lg px-2 py-2 capitalize ${targetMode === mode ? "bg-brand text-white shadow" : "text-slate-600"}`} onClick={() => setTargetMode(mode)}>
                    {mode === "all" ? "Full Class" : mode}
                  </button>
                ))}
              </div>
              {targetMode === "all" && <p className="mt-3 text-xs leading-relaxed text-slate-500">Every student in the selected classroom will receive this assignment.</p>}
              {targetMode === "batches" && (
                <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
                  {assignableBatches.map((batch) => (
                    <label key={batch._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span>{batch.name}</span>
                      <input type="checkbox" checked={assignedBatches.includes(batch._id)} onChange={() => toggleId(batch._id, assignedBatches, setAssignedBatches)} />
                    </label>
                  ))}
                  {!assignableBatches.length && <div className="text-xs text-slate-500">No batches found for this classroom.</div>}
                </div>
              )}
              {targetMode === "students" && (
                <div className="mt-3">
                  <input className="input mb-2 h-9" placeholder="Search students" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} />
                  <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                    {assignableStudents.map((student) => (
                      <label key={student._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <span>
                          <b>{student.name}</b>
                          <span className="block text-xs text-slate-500">{student.username || student.email}</span>
                        </span>
                        <input type="checkbox" checked={assignedStudents.includes(student._id)} onChange={() => toggleId(student._id, assignedStudents, setAssignedStudents)} />
                      </label>
                    ))}
                    {!assignableStudents.length && <div className="text-xs text-slate-500">No students found.</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric label="Activities" value={activities.length} />
            <Metric label="Ready" value={readyCount} />
            <Metric label="Points" value={totalPoints} />
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_1fr] rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/10 p-4">
            <PanelTitle icon={<ListChecks size={17} />} title="Activities" />
            <div className="flex flex-wrap gap-2">
              <select className="h-9 rounded-lg border border-brand/10 bg-white px-3 text-sm font-semibold" onChange={(event) => addActivity(event.target.value as ActivityType)} value="">
                <option value="" disabled>Add activity</option>
                {activityTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
              <button type="button" className="btn-accent h-9 min-h-9 px-3" onClick={() => addActivity()}><Plus size={15} /> Add</button>
            </div>
          </div>

          <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="space-y-2">
                {activities.map((activity, index) => (
                  <button
                    key={activity.id}
                    type="button"
                    className={`w-full rounded-xl border p-3 text-left transition ${activeIndex === index ? "border-brand bg-brand text-white shadow-lg" : "border-brand/10 bg-white hover:border-brand/30 hover:bg-brand-50"}`}
                    onClick={() => setActiveIndex(index)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold">{activity.title || `Activity ${index + 1}`}</div>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${activeIndex === index ? "bg-accent text-brand" : "bg-accent/30 text-brand"}`}>{activity.points || 0} pt</span>
                    </div>
                    <div className={`mt-1 text-xs font-semibold ${activeIndex === index ? "text-accent" : "text-brand"}`}>{labelFor(activity.type)}</div>
                    <div className={`mt-1 line-clamp-2 text-xs ${activeIndex === index ? "text-white/75" : "text-slate-500"}`}>
                      {activity.instructions || activity.quiz?.question || activity.fen || "Configure this activity"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <ActivityEditor
              activity={activeActivity}
              index={activeIndex}
              count={activities.length}
              onTypeChange={replaceActiveType}
              onRemove={() => removeActivity(activeIndex)}
              onChange={(patch) => updateActivity(activeIndex, patch)}
            />
          </div>
        </section>

        <aside className="grid min-h-0 grid-rows-[auto_auto_1fr_auto] rounded-2xl border border-brand/10 bg-[#2a0936] p-4 text-white shadow-xl shadow-brand-900/20">
          <PanelTitle icon={<Library size={17} />} title="Activity Library" light />
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1 text-sm font-bold">
            <button type="button" className={`rounded-lg py-2 ${libraryMode === "sets" ? "bg-accent text-brand" : "text-white/70"}`} onClick={() => setLibraryMode("sets")}>Saved Sets</button>
            <button type="button" className={`rounded-lg py-2 ${libraryMode === "pgn" ? "bg-accent text-brand" : "text-white/70"}`} onClick={() => setLibraryMode("pgn")}>PGN Library</button>
          </div>
          <div className="mt-3 min-h-0 overflow-y-auto pr-1">
            <div className="mb-3 rounded-xl border border-white/10 bg-white/10 p-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3">
                <Search size={15} className="text-accent" />
                <input className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/45 outline-none" placeholder="Search library" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} />
              </div>
              {libraryMode === "sets" ? (
                <select className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#3a1048] px-3 text-sm text-white" value={libraryType} onChange={(event) => setLibraryType(event.target.value as ActivityType | "all")}>
                  <option value="all">All activity types</option>
                  {activityTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
              ) : (
                <select className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#3a1048] px-3 text-sm text-white" value={pgnFolder} onChange={(event) => setPgnFolder(event.target.value)}>
                  {pgnFolders.map((folder) => <option key={folder} value={folder}>{folder === "all" ? "All folders" : folder}</option>)}
                </select>
              )}
            </div>

            {libraryMode === "sets" ? (
              <>
                <div className="mb-3 rounded-xl border border-white/10 bg-white/10 p-3">
                  <div className="text-sm font-bold">Save current work</div>
                  <div className="mt-2 flex gap-2">
                    <input className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-3 text-sm text-white placeholder-white/40 outline-none focus:border-accent" placeholder="Name this activity set" value={packName} onChange={(event) => setPackName(event.target.value)} />
                    <button type="button" className="rounded-lg bg-accent px-3 text-sm font-bold text-brand" onClick={savePack}>Save</button>
                  </div>
                </div>
                <LibraryList packs={visiblePacks} onLoad={loadPack} />
              </>
            ) : (
              <PgnLibrary
                pgns={visiblePgns}
                selectedPgnId={selectedPgnId}
                onSelect={(id) => {
                  setSelectedPgnId(id);
                  setSelectedPgnPositions([]);
                }}
                selectedPgn={selectedPgn}
                positions={pgnPositions}
                selectedPositions={selectedPgnPositions}
                onTogglePosition={(ply) => toggleNumber(ply, selectedPgnPositions, setSelectedPgnPositions)}
                onImportPgn={importEntirePgn}
                onImportPositions={() => selectedPgn && importPgnPositions(selectedPgn, pgnPositions.filter((position) => selectedPgnPositions.includes(position.ply)))}
              />
            )}
          </div>
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/15 p-3 text-sm text-white/85">
            <Filter size={17} className="mb-2 text-accent" />
            Save reusable activity sets here. PGN imports can become full study tasks or selected position activities.
          </div>
        </aside>
      </div>
    </form>
  );
}

function ActivityEditor({
  activity,
  index,
  count,
  onTypeChange,
  onRemove,
  onChange,
}: {
  activity?: Activity;
  index: number;
  count: number;
  onTypeChange: (type: ActivityType) => void;
  onRemove: () => void;
  onChange: (patch: Partial<Activity>) => void;
}) {
  if (!activity) return null;
  const needsFen = ["solve_position", "find_best_move", "find_combination", "analyze_position", "endgame_practice", "opening_practice", "play_computer"].includes(activity.type);
  return (
    <div className="min-h-0 overflow-y-auto rounded-2xl bg-[#fbf7ff] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand/60">Edit Activity</div>
          <h2 className="text-xl font-black text-brand">Activity {index + 1}</h2>
        </div>
        {count > 1 && (
          <button type="button" className="rounded-lg border border-red-100 bg-white p-2 text-red-600 hover:bg-red-50" onClick={onRemove} aria-label="Remove activity">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-[1fr_190px]">
          <label className="text-xs font-bold text-slate-600">
            Activity Type
            <select className="input mt-1 h-11" value={activity.type} onChange={(event) => onTypeChange(event.target.value as ActivityType)}>
              {activityTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Difficulty
            <select className="input mt-1 h-11" value={activity.difficulty} onChange={(event) => onChange({ difficulty: event.target.value as Difficulty })}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </div>
        <label className="text-xs font-bold text-slate-600">
          Title
          <input className="input mt-1 h-11" value={activity.title} onChange={(event) => onChange({ title: event.target.value })} />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Instructions students will see
          <textarea className="input mt-1 h-20 resize-none" placeholder="Tell the student exactly what to do" value={activity.instructions} onChange={(event) => onChange({ instructions: event.target.value })} />
        </label>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold text-slate-600">
            Points
            <input className="input mt-1 h-11" type="number" min={0} value={activity.points} onChange={(event) => onChange({ points: Number(event.target.value) })} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Time Limit
            <input className="input mt-1 h-11" type="number" min={0} value={activity.timeLimitMinutes} onChange={(event) => onChange({ timeLimitMinutes: Number(event.target.value) })} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Topic
            <input className="input mt-1 h-11" placeholder="Forks, K+P, Sicilian" value={activity.topic || ""} onChange={(event) => onChange({ topic: event.target.value })} />
          </label>
        </div>

        {needsFen && (
          <label className="text-xs font-bold text-slate-600">
            Starting Position FEN
            <textarea className="input mt-1 h-20 resize-none font-mono text-xs" placeholder="Paste FEN here" value={activity.fen || ""} onChange={(event) => onChange({ fen: event.target.value })} />
          </label>
        )}

        {["solve_position", "find_best_move", "find_combination"].includes(activity.type) && (
          <label className="text-xs font-bold text-slate-600">
            Solution moves
            <input className="input mt-1 h-11" placeholder="SAN moves, e.g. Nf6 Bxc6+" value={activity.solution} onChange={(event) => onChange({ solution: event.target.value })} />
          </label>
        )}

        {activity.type === "quiz" && <QuizEditor activity={activity} onChange={onChange} />}
        {(activity.type === "play_computer" || activity.type === "endgame_practice" || activity.type === "opening_practice") && <ComputerEditor activity={activity} onChange={onChange} />}
        {activity.type === "study_pgn" && (
          <label className="text-xs font-bold text-slate-600">
            PGN Text
            <textarea className="input mt-1 h-44 resize-none font-mono text-xs" placeholder="Paste or import PGN from the library" value={activity.pgn || ""} onChange={(event) => onChange({ pgn: event.target.value })} />
          </label>
        )}
        {activity.type === "analyze_position" && (
          <label className="text-xs font-bold text-slate-600">
            Expected analysis note
            <textarea className="input mt-1 h-16 resize-none" placeholder="Optional coach note or model answer" value={activity.solution} onChange={(event) => onChange({ solution: event.target.value })} />
          </label>
        )}
      </div>
    </div>
  );
}

function QuizEditor({ activity, onChange }: { activity: Activity; onChange: (patch: Partial<Activity>) => void }) {
  const quiz = activity.quiz || { question: "", options: defaultOptions, multipleCorrect: false, explanation: "", positionFen: "" };
  function updateQuiz(patch: Partial<NonNullable<Activity["quiz"]>>) {
    onChange({ quiz: { ...quiz, ...patch } });
  }
  function updateOption(index: number, patch: Partial<QuizOption>) {
    const next = quiz.options.map((option, idx) => (idx === index ? { ...option, ...patch } : option));
    updateQuiz({ options: next });
  }
  return (
    <div className="rounded-2xl border border-brand/10 bg-white p-3">
      <div className="mb-3 text-sm font-black text-brand">Quiz Settings</div>
      <div className="grid gap-3">
        <label className="text-xs font-bold text-slate-600">
          Question
          <input className="input mt-1 h-11" value={quiz.question} onChange={(event) => updateQuiz({ question: event.target.value })} />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Optional Position FEN
          <input className="input mt-1 h-11 font-mono text-xs" placeholder="Attach a board position to this question" value={quiz.positionFen || ""} onChange={(event) => updateQuiz({ positionFen: event.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={quiz.multipleCorrect} onChange={(event) => updateQuiz({ multipleCorrect: event.target.checked })} />
          Allow multiple correct answers
        </label>
        <div className="space-y-2">
          {quiz.options.map((option, index) => (
            <div key={option.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2">
              <input type={quiz.multipleCorrect ? "checkbox" : "radio"} checked={option.correct} onChange={(event) => {
                if (quiz.multipleCorrect) updateOption(index, { correct: event.target.checked });
                else updateQuiz({ options: quiz.options.map((item, idx) => ({ ...item, correct: idx === index })) });
              }} />
              <input className="input h-10" value={option.text} onChange={(event) => updateOption(index, { text: event.target.value })} />
              <button type="button" className="rounded-lg border border-red-100 p-2 text-red-600" onClick={() => updateQuiz({ options: quiz.options.filter((_, idx) => idx !== index) })}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-outline h-9 w-fit" onClick={() => updateQuiz({ options: [...quiz.options, { id: `${Date.now()}`, text: "New option", correct: false }] })}><Plus size={14} /> Add Option</button>
        <label className="text-xs font-bold text-slate-600">
          Explanation
          <textarea className="input mt-1 h-16 resize-none" value={quiz.explanation} onChange={(event) => updateQuiz({ explanation: event.target.value })} />
        </label>
      </div>
    </div>
  );
}

function ComputerEditor({ activity, onChange }: { activity: Activity; onChange: (patch: Partial<Activity>) => void }) {
  const computer = activity.computer || makeActivity("play_computer").computer!;
  function updateComputer(patch: Partial<NonNullable<Activity["computer"]>>) {
    onChange({ computer: { ...computer, ...patch } });
  }
  return (
    <div className="rounded-2xl border border-brand/10 bg-white p-3">
      <div className="mb-3 text-sm font-black text-brand">Computer Practice</div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">
          Computer Strength
          <select className="input mt-1 h-11" value={computer.strength} onChange={(event) => updateComputer({ strength: event.target.value })}>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
            <option>Rating Based</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Rating Level
          <input className="input mt-1 h-11" type="number" min={100} max={3000} value={computer.rating} onChange={(event) => updateComputer({ rating: Number(event.target.value) })} />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Side
          <select className="input mt-1 h-11" value={computer.side} onChange={(event) => updateComputer({ side: event.target.value as "white" | "black" | "random" })}>
            <option value="white">White</option>
            <option value="black">Black</option>
            <option value="random">Random</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Objective
          <select className="input mt-1 h-11" value={computer.objective} onChange={(event) => updateComputer({ objective: event.target.value })}>
            <option>Win the Game</option>
            <option>Draw the Game</option>
            <option>Survive X Moves</option>
            <option>Convert Winning Position</option>
            <option>Defend Difficult Position</option>
            <option>Practice Endgame</option>
            <option>Practice Opening</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Time Control
          <select className="input mt-1 h-11" value={computer.timeControl.type} onChange={(event) => updateComputer({ timeControl: { ...computer.timeControl, type: event.target.value as "untimed" | "fixed" | "increment" } })}>
            <option value="untimed">Untimed</option>
            <option value="fixed">Fixed Time</option>
            <option value="increment">Increment</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Completion Rule
          <select className="input mt-1 h-11" value={computer.completion} onChange={(event) => updateComputer({ completion: event.target.value })}>
            <option>Game Finished</option>
            <option>Win Required</option>
            <option>Draw or Better</option>
            <option>Complete Required Number of Moves</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Minutes
          <input className="input mt-1 h-11" type="number" min={0} value={computer.timeControl.minutes} onChange={(event) => updateComputer({ timeControl: { ...computer.timeControl, minutes: Number(event.target.value) } })} />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Increment / Required Moves
          <input className="input mt-1 h-11" type="number" min={0} value={computer.timeControl.type === "increment" ? computer.timeControl.increment : computer.requiredMoves} onChange={(event) => {
            const value = Number(event.target.value);
            if (computer.timeControl.type === "increment") updateComputer({ timeControl: { ...computer.timeControl, increment: value } });
            else updateComputer({ requiredMoves: value });
          }} />
        </label>
      </div>
    </div>
  );
}

function PgnLibrary({
  pgns,
  selectedPgnId,
  selectedPgn,
  positions,
  selectedPositions,
  onSelect,
  onTogglePosition,
  onImportPgn,
  onImportPositions,
}: {
  pgns: PgnDoc[];
  selectedPgnId: string;
  selectedPgn: PgnDoc | null;
  positions: PgnPosition[];
  selectedPositions: number[];
  onSelect: (id: string) => void;
  onTogglePosition: (ply: number) => void;
  onImportPgn: (pgn: PgnDoc) => void;
  onImportPositions: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {pgns.map((pgn) => (
          <button key={pgn._id} type="button" className={`w-full rounded-xl border p-3 text-left transition ${selectedPgnId === pgn._id ? "border-accent bg-accent text-brand" : "border-white/10 bg-white/8 hover:border-accent/60 hover:bg-white/15"}`} onClick={() => onSelect(pgn._id)}>
            <div className="font-bold">{pgn.title}</div>
            <div className={`mt-1 text-xs ${selectedPgnId === pgn._id ? "text-brand/70" : "text-white/60"}`}>{pgn.folder || "Unfiled"} · {pgn.white || "White"} vs {pgn.black || "Black"}</div>
          </button>
        ))}
        {!pgns.length && <div className="rounded-xl border border-white/10 p-4 text-sm text-white/60">No PGNs match this search.</div>}
      </div>

      {selectedPgn && (
        <div className="rounded-xl border border-white/10 bg-white/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold">{selectedPgn.title}</div>
              <div className="text-xs text-white/60">{positions.length} positions available</div>
            </div>
            <button type="button" className="rounded-lg bg-accent px-3 py-2 text-xs font-black text-brand" onClick={() => onImportPgn(selectedPgn)}>Import PGN</button>
          </div>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {positions.slice(0, 80).map((position) => (
              <label key={position.ply} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#3a1048] px-3 py-2 text-sm">
                <span>Move {position.moveNumber}: {position.san}</span>
                <input type="checkbox" checked={selectedPositions.includes(position.ply)} onChange={() => onTogglePosition(position.ply)} />
              </label>
            ))}
          </div>
          <button type="button" className="mt-3 w-full rounded-lg border border-accent/50 px-3 py-2 text-sm font-bold text-accent" onClick={onImportPositions}>Import selected positions</button>
        </div>
      )}
    </div>
  );
}

function PanelTitle({ icon, title, light = false }: { icon: React.ReactNode; title: string; light?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm font-black ${light ? "text-white" : "text-brand"}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${light ? "bg-accent text-brand" : "bg-accent/40 text-brand"}`}>{icon}</span>
      {title}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-3 text-center shadow-sm">
      <div className="text-lg font-black text-brand">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function LibraryList({ packs, onLoad }: { packs: ActivityPack[]; onLoad: (pack: ActivityPack) => void }) {
  return (
    <div className="space-y-2">
      {packs.map((pack) => (
        <button key={pack.id} type="button" className="w-full rounded-xl border border-white/10 bg-white/8 p-3 text-left transition hover:border-accent/60 hover:bg-white/15" onClick={() => onLoad(pack)}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold">{pack.name}</div>
            <ChevronDown size={15} className="-rotate-90 text-accent" />
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/60">{pack.description}</div>
          <div className="mt-2 flex gap-2 text-xs font-semibold text-accent">
            <span>{pack.activities.length} activities</span>
            <span>{pack.type.replaceAll("_", " ")}</span>
          </div>
        </button>
      ))}
      {!packs.length && <div className="rounded-xl border border-white/10 p-4 text-sm text-white/60">No saved activity sets match this filter.</div>}
    </div>
  );
}

function toggleId(id: string, current: string[], setter: (value: string[]) => void) {
  setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
}

function toggleNumber(value: number, current: number[], setter: (value: number[]) => void) {
  setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
}

function labelFor(type: ActivityType) {
  return activityTypes.find((item) => item.id === type)?.label || type.replaceAll("_", " ");
}

function isActivityReady(activity: Activity) {
  if (activity.type === "quiz") return Boolean(activity.quiz?.question && activity.quiz.options.some((option) => option.correct));
  if (activity.type === "study_pgn") return Boolean(activity.pgn);
  if (activity.type === "play_computer") return Boolean(activity.fen && activity.computer?.objective);
  if (activity.type === "analyze_position") return Boolean(activity.fen);
  return Boolean(activity.fen && (activity.solution || activity.computer));
}

function toPayloadActivity(activity: Activity) {
  const solution = activity.solution.trim().split(/\s+/).filter(Boolean);
  return {
    ...activity,
    solution,
    quiz: activity.quiz
      ? {
          ...activity.quiz,
          correctAnswers: activity.quiz.options.map((option, index) => (option.correct ? index : -1)).filter((index) => index >= 0),
        }
      : undefined,
  };
}

function extractPgnPositions(pgn: string): PgnPosition[] {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const moves = game.history({ verbose: true }) as any[];
    const headerFen = pgn.match(/\[FEN\s+"([^"]+)"\]/)?.[1];
    const replay = headerFen ? new Chess(headerFen) : new Chess();
    return moves.flatMap((move, index) => {
      const played = replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (!played) return [];
      return [{ moveNumber: Math.ceil((index + 1) / 2), ply: index + 1, san: played.san, fen: replay.fen() }];
    });
  } catch {
    return [];
  }
}
