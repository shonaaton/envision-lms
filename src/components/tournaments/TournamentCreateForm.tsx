"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { ArrowLeft, ArrowRight, RotateCcw, Search, ShieldCheck, Trophy } from "lucide-react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((mod) => mod.Chessboard), { ssr: false });

type TournamentType = "swiss" | "arena";
type InviteMode = "public" | "private" | "password" | "entry_code";
type BatchOption = { id: string; name: string };
type StudentOption = { id: string; name: string; email: string; level: string; active: boolean };
type CourseOption = { id: string; name: string; level: string; levels: { id: string; name: string }[] };
type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};
type ServerAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type Draft = {
  name: string;
  description: string;
  type: TournamentType;
  initialStatus: "draft" | "created" | "registration_open";
  arenaDurationMinutes: string;
  rounds: string;
  breakBetweenRoundsMinutes: string;
  timeControlMinutes: string;
  incrementSeconds: string;
  rated: boolean;
  allowBerserk: boolean;
  arenaStreaks: boolean;
  chatEnabled: boolean;
  lateJoiningAllowed: boolean;
  entryRestrictions: string;
  startDate: string;
  startTime: string;
  repeatEnabled: boolean;
  repeatUntilDate: string;
  repeatDays: string;
  repeatCount: string;
  repeatDaily: boolean;
  startingPositionType: "normal" | "custom";
  customFen: string;
  allActiveStudents: boolean;
  includeCoaches: boolean;
  includeInactiveStudents: boolean;
  batches: string[];
  students: string[];
  courses: string[];
  levels: string[];
  externalInviteEnabled: boolean;
  externalInviteMode: InviteMode;
  externalInvitePassword: string;
  externalInviteEntryCode: string;
  externalInviteExpiresAt: string;
};

const STUDENT_LEVELS = [
  { value: "absolute_beginner", label: "Absolute Beginner" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "federated", label: "Federated" },
  { value: "not_set", label: "Level Not Set" },
];

function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      {children}
      <span className={`block text-xs leading-5 ${error ? "text-red-600" : "text-slate-500"}`}>{error || description}</span>
    </label>
  );
}

function textInputClass(hasError?: boolean) {
  return `h-10 w-full rounded-md border px-3 text-sm ${hasError ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`;
}

function toggleList(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function normalizeFen(type: Draft["startingPositionType"], fen: string) {
  if (type === "normal") return new Chess().fen();
  return fen.trim();
}

function isValidFen(type: Draft["startingPositionType"], fen: string) {
  if (type === "normal") return true;
  try {
    new Chess(fen.trim());
    return true;
  } catch {
    return false;
  }
}

function buildClientErrors(draft: Draft, step: number) {
  const errors: Record<string, string> = {};
  if (step >= 1) {
    if (!draft.name.trim()) errors.name = "Tournament name is required.";
    if (!draft.type) errors.type = "Choose Swiss or Arena.";
  }
  if (step >= 2) {
    if (!draft.timeControlMinutes || Number(draft.timeControlMinutes) < 1) errors.timeControlMinutes = "Time control must be at least 1 minute.";
    if (!draft.startDate) errors.startDate = "Start date is required.";
    if (!draft.startTime) errors.startTime = "Start time is required.";
    if (draft.type === "arena" && (!draft.arenaDurationMinutes || Number(draft.arenaDurationMinutes) < 1)) errors.arenaDurationMinutes = "Arena duration is required.";
    if (draft.type === "swiss" && (!draft.rounds || Number(draft.rounds) < 1)) errors.rounds = "Swiss rounds are required.";
    if (draft.startingPositionType === "custom" && !draft.customFen.trim()) errors.customFen = "Custom FEN is required.";
    if (draft.startingPositionType === "custom" && draft.customFen.trim() && !isValidFen("custom", draft.customFen)) errors.customFen = "Custom FEN is not valid.";
  }
  if (step >= 3) {
    const hasInternalAccess =
      draft.allActiveStudents ||
      draft.includeCoaches ||
      draft.includeInactiveStudents ||
      draft.batches.length > 0 ||
      draft.students.length > 0 ||
      draft.courses.length > 0 ||
      draft.levels.length > 0;
    if (!hasInternalAccess && !draft.externalInviteEnabled) {
      errors.access = "Select at least one access group or enable external invitation access.";
    }
    if (draft.externalInviteEnabled && draft.externalInviteMode === "password" && !draft.externalInvitePassword.trim()) {
      errors.externalInvitePassword = "Password is required for password-protected links.";
    }
    if (draft.externalInviteEnabled && draft.externalInviteMode === "entry_code" && !draft.externalInviteEntryCode.trim()) {
      errors.externalInviteEntryCode = "Entry code is required for entry-code links.";
    }
  }
  return errors;
}

export default function TournamentCreateForm({
  batches,
  students,
  courses,
  action,
  error,
}: {
  batches: BatchOption[];
  students: StudentOption[];
  courses: CourseOption[];
  action: ServerAction;
  error?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState(1);
  const [studentSearch, setStudentSearch] = useState("");
  const [fenStatus, setFenStatus] = useState("");
  const [draft, setDraft] = useState<Draft>({
    name: "",
    description: "",
    type: "arena",
    initialStatus: "registration_open",
    arenaDurationMinutes: "",
    rounds: "",
    breakBetweenRoundsMinutes: "0",
    timeControlMinutes: "",
    incrementSeconds: "0",
    rated: false,
    allowBerserk: false,
    arenaStreaks: true,
    chatEnabled: false,
    lateJoiningAllowed: true,
    entryRestrictions: "",
    startDate: "",
    startTime: "",
    repeatEnabled: false,
    repeatUntilDate: "",
    repeatDays: "",
    repeatCount: "1",
    repeatDaily: false,
    startingPositionType: "normal",
    customFen: "",
    allActiveStudents: false,
    includeCoaches: false,
    includeInactiveStudents: false,
    batches: [],
    students: [],
    courses: [],
    levels: [],
    externalInviteEnabled: false,
    externalInviteMode: "private",
    externalInvitePassword: "",
    externalInviteEntryCode: "",
    externalInviteExpiresAt: "",
  });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [state, formAction] = useFormState(action, { error });
  const mergedErrors = useMemo(() => ({ ...state.fieldErrors, ...localErrors }), [state.fieldErrors, localErrors]);
  const previewFen = normalizeFen(draft.startingPositionType, draft.customFen);
  const canPreview = draft.startingPositionType === "normal" || isValidFen("custom", draft.customFen);
  const filteredStudents = students
    .filter((student) => `${student.name} ${student.email} ${student.level}`.toLowerCase().includes(studentSearch.toLowerCase()))
    .slice(0, 80);

  useEffect(() => {
    if (pending) setPending(false);
  }, [state, pending]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setLocalErrors((current) => {
      const next = { ...current };
      delete next[String(key)];
      delete next.access;
      return next;
    });
    if (key === "customFen" || key === "startingPositionType") setFenStatus("");
  }

  function nextStep() {
    const nextErrors = buildClientErrors(draft, step);
    const relevant = Object.keys(nextErrors).filter((key) => {
      if (step === 1) return ["name", "type"].includes(key);
      if (step === 2) return ["arenaDurationMinutes", "rounds", "timeControlMinutes", "startDate", "startTime", "customFen"].includes(key);
      return ["access", "externalInvitePassword", "externalInviteEntryCode"].includes(key);
    });
    if (relevant.length) {
      setLocalErrors(nextErrors);
      return;
    }
    setStep((value) => Math.min(3, value + 1));
  }

  function submitAll() {
    const nextErrors = buildClientErrors(draft, 3);
    if (Object.keys(nextErrors).length) {
      setLocalErrors(nextErrors);
      setStep(Object.keys(nextErrors).some((key) => ["name", "type"].includes(key)) ? 1 : Object.keys(nextErrors).some((key) => ["arenaDurationMinutes", "rounds", "timeControlMinutes", "startDate", "startTime", "customFen"].includes(key)) ? 2 : 3);
      return;
    }
    setPending(true);
    formRef.current?.requestSubmit();
  }

  function validateFen() {
    if (draft.startingPositionType === "normal") {
      setFenStatus("Standard starting position is ready.");
      return;
    }
    setFenStatus(isValidFen("custom", draft.customFen) ? "Custom position is valid." : "This FEN is not valid yet.");
  }

  function resetPosition() {
    update("startingPositionType", "normal");
    update("customFen", "");
    setFenStatus("Reset to the standard starting position.");
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {state.error || error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error || error}</div> : null}

      {Object.entries(draft).map(([key, value]) => Array.isArray(value) ? null : <input key={key} type="hidden" name={key} value={typeof value === "boolean" ? (value ? "yes" : "no") : String(value)} />)}
      {draft.batches.map((id) => <input key={`batch-${id}`} type="hidden" name="batches" value={id} />)}
      {draft.students.map((id) => <input key={`student-${id}`} type="hidden" name="students" value={id} />)}
      {draft.courses.map((id) => <input key={`course-${id}`} type="hidden" name="courses" value={id} />)}
      {draft.levels.map((id) => <input key={`level-${id}`} type="hidden" name="levels" value={id} />)}

      <div className="grid grid-cols-3 gap-2 text-sm">
        {["Basic Details", `${draft.type === "arena" ? "Arena" : "Swiss"} Setup`, "Access"].map((label, index) => (
          <div key={label} className={`rounded-md px-3 py-2 text-center font-medium ${step === index + 1 ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-600"}`}>
            Step {index + 1}: {label}
          </div>
        ))}
      </div>

      {step === 1 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Step 1: Basic Tournament Details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Tournament Name" description="Enter the public name students will see." error={mergedErrors.name}>
              <input value={draft.name} onChange={(event) => update("name", event.target.value)} className={textInputClass(Boolean(mergedErrors.name))} placeholder="Beginner Practice Arena" />
            </Field>
            <Field label="Tournament Type" description="Choose Swiss for fixed rounds or Arena for duration-based play." error={mergedErrors.type}>
              <select value={draft.type} onChange={(event) => update("type", event.target.value as TournamentType)} className={textInputClass(Boolean(mergedErrors.type))}>
                <option value="arena">Arena</option>
                <option value="swiss">Swiss</option>
              </select>
            </Field>
            <Field label="Initial Lifecycle Status" description="Draft stays private. Created is prepared. Registration Open lets players join.">
              <select value={draft.initialStatus} onChange={(event) => update("initialStatus", event.target.value as Draft["initialStatus"])} className={textInputClass()}>
                <option value="registration_open">Registration Open</option>
                <option value="created">Created</option>
                <option value="draft">Draft</option>
              </select>
            </Field>
            <Field label="Tournament Description" description="Optional details, rules, or instructions for participants.">
              <textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Practice tournament for beginner students" className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </Field>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Step 2: {draft.type === "arena" ? "Arena" : "Swiss"} Tournament Setup</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {draft.type === "arena" ? (
              <Field label="Total Arena Duration" description="Total playing time for the arena in minutes." error={mergedErrors.arenaDurationMinutes}>
                <input value={draft.arenaDurationMinutes} onChange={(event) => update("arenaDurationMinutes", event.target.value)} type="number" min="1" className={textInputClass(Boolean(mergedErrors.arenaDurationMinutes))} placeholder="60" />
              </Field>
            ) : (
              <>
                <Field label="Number of Rounds" description="Total Swiss rounds to be paired and played." error={mergedErrors.rounds}>
                  <input value={draft.rounds} onChange={(event) => update("rounds", event.target.value)} type="number" min="1" className={textInputClass(Boolean(mergedErrors.rounds))} placeholder="5" />
                </Field>
                <Field label="Break Between Rounds" description="Break duration between Swiss rounds in minutes.">
                  <input value={draft.breakBetweenRoundsMinutes} onChange={(event) => update("breakBetweenRoundsMinutes", event.target.value)} type="number" min="0" className={textInputClass()} placeholder="5" />
                </Field>
              </>
            )}
            <Field label="Time Control" description="Base time per player in minutes." error={mergedErrors.timeControlMinutes}>
              <input value={draft.timeControlMinutes} onChange={(event) => update("timeControlMinutes", event.target.value)} type="number" min="1" className={textInputClass(Boolean(mergedErrors.timeControlMinutes))} placeholder="10" />
            </Field>
            <Field label="Increment" description="Increment per move in seconds.">
              <input value={draft.incrementSeconds} onChange={(event) => update("incrementSeconds", event.target.value)} type="number" min="0" className={textInputClass()} placeholder="0" />
            </Field>
            <Field label="Rated or Casual" description="Rated tournaments can be reported separately from casual events.">
              <select value={draft.rated ? "yes" : "no"} onChange={(event) => update("rated", event.target.value === "yes")} className={textInputClass()}>
                <option value="no">Casual</option>
                <option value="yes">Rated</option>
              </select>
            </Field>
            {draft.type === "arena" ? (
              <>
                <Field label="Allow Berserk" description="Let players halve their clock for bonus points.">
                  <select value={draft.allowBerserk ? "yes" : "no"} onChange={(event) => update("allowBerserk", event.target.value === "yes")} className={textInputClass()}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
                <Field label="Arena Streaks" description="Award double win points after a winning streak.">
                  <select value={draft.arenaStreaks ? "yes" : "no"} onChange={(event) => update("arenaStreaks", event.target.value === "yes")} className={textInputClass()}>
                    <option value="yes">Enabled</option>
                    <option value="no">Disabled</option>
                  </select>
                </Field>
              </>
            ) : null}
            <Field label="Tournament Chat" description="Enable or disable tournament lobby chat.">
              <select value={draft.chatEnabled ? "yes" : "no"} onChange={(event) => update("chatEnabled", event.target.value === "yes")} className={textInputClass()}>
                <option value="no">Disabled</option>
                <option value="yes">Enabled</option>
              </select>
            </Field>
            <Field label="Late Joining" description={draft.type === "swiss" ? "Late joiners wait for the next Swiss pairing cycle." : "Late joiners enter the next Arena pairing cycle."}>
              <select value={draft.lateJoiningAllowed ? "yes" : "no"} onChange={(event) => update("lateJoiningAllowed", event.target.value === "yes")} className={textInputClass()}>
                <option value="yes">Allowed</option>
                <option value="no">Not allowed</option>
              </select>
            </Field>
            <Field label="Entry Restrictions" description="Optional text shown on tournament cards and invite pages.">
              <input value={draft.entryRestrictions} onChange={(event) => update("entryRestrictions", event.target.value)} className={textInputClass()} placeholder="U1200, batch only, invitation only..." />
            </Field>
            <Field label="Start Date" description="The calendar date when the tournament starts." error={mergedErrors.startDate}>
              <input value={draft.startDate} onChange={(event) => update("startDate", event.target.value)} type="date" className={textInputClass(Boolean(mergedErrors.startDate))} />
            </Field>
            <Field label="Start Time" description="The local start time students will see." error={mergedErrors.startTime}>
              <input value={draft.startTime} onChange={(event) => update("startTime", event.target.value)} type="time" className={textInputClass(Boolean(mergedErrors.startTime))} />
            </Field>
            <Field label="Repeat Tournament Option" description="Enable if this tournament should be generated on multiple dates.">
              <select value={draft.repeatEnabled ? "yes" : "no"} onChange={(event) => update("repeatEnabled", event.target.value === "yes")} className={textInputClass()}>
                <option value="no">Do not repeat</option>
                <option value="yes">Repeat tournament</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-md bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold">Starting Position Tools</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Starting Position" description="Choose normal chess start or provide a custom FEN.">
                  <select value={draft.startingPositionType} onChange={(event) => update("startingPositionType", event.target.value as "normal" | "custom")} className={textInputClass()}>
                    <option value="normal">Standard Starting Position</option>
                    <option value="custom">Custom FEN</option>
                  </select>
                </Field>
                <div className="flex items-end gap-2">
                  <button type="button" onClick={validateFen} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                    <ShieldCheck size={15} /> Validate Position
                  </button>
                  <button type="button" onClick={resetPosition} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                    <RotateCcw size={15} /> Reset
                  </button>
                </div>
                <Field label="Position Editor" description="Paste or edit the FEN, then validate and preview it." error={mergedErrors.customFen}>
                  <textarea disabled={draft.startingPositionType === "normal"} value={draft.customFen} onChange={(event) => update("customFen", event.target.value)} className={`min-h-24 w-full rounded-md border px-3 py-2 text-sm ${mergedErrors.customFen ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`} placeholder="rnbqkbnr/pppppppp/8/8/..." />
                </Field>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">Position Preview</div>
                  <div className="mt-1">{fenStatus || (draft.startingPositionType === "normal" ? "Standard board preview." : "Custom FEN preview updates after a valid FEN.")}</div>
                  {canPreview ? <div className="mt-2 break-all text-[11px] text-slate-500">{previewFen}</div> : null}
                </div>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="mx-auto max-w-[260px]">
                {canPreview ? <Chessboard id="tournament-position-preview" position={previewFen} boardWidth={260} arePiecesDraggable={false} /> : <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-500">Invalid FEN</div>}
              </div>
            </div>
          </div>

          {draft.repeatEnabled && (
            <div className="mt-4 rounded-md bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold">Repeat Tournament Settings</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Repeat Until Date" description="Stop generating repeated tournaments after this date.">
                  <input value={draft.repeatUntilDate} onChange={(event) => update("repeatUntilDate", event.target.value)} type="date" className={textInputClass()} />
                </Field>
                <Field label="Repeat on Selected Days" description="Use numbers 0-6 for Sun-Sat, comma separated.">
                  <input value={draft.repeatDays} onChange={(event) => update("repeatDays", event.target.value)} className={textInputClass()} placeholder="1,3,5" />
                </Field>
                <Field label="Number of Times to Repeat" description="Maximum number of tournament copies to create.">
                  <input value={draft.repeatCount} onChange={(event) => update("repeatCount", event.target.value)} type="number" min="1" className={textInputClass()} placeholder="5" />
                </Field>
                <Field label="Daily Repeat Option" description="Choose yes to repeat every day.">
                  <select value={draft.repeatDaily ? "yes" : "no"} onChange={(event) => update("repeatDaily", event.target.value === "yes")} className={textInputClass()}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
              </div>
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Step 3: Tournament Access</h2>
          {mergedErrors.access ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{mergedErrors.access}</div> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <input checked={draft.allActiveStudents} onChange={(event) => update("allActiveStudents", event.target.checked)} type="checkbox" className="mt-1" />
              <span><b>All Active Students</b><br /><small className="text-slate-500">Every active student can view and join.</small></span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <input checked={draft.includeInactiveStudents} onChange={(event) => update("includeInactiveStudents", event.target.checked)} type="checkbox" className="mt-1" />
              <span><b>Inactive Students</b><br /><small className="text-slate-500">Manually include inactive student profiles.</small></span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <input checked={draft.includeCoaches} onChange={(event) => update("includeCoaches", event.target.checked)} type="checkbox" className="mt-1" />
              <span><b>Coach Visibility</b><br /><small className="text-slate-500">Coaches can view participants, pairings, games, and standings.</small></span>
            </label>
            <Field label="Selected Student Search" description="Find individual students by name, email, or level.">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={15} />
                <input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm" placeholder="Search students" />
              </div>
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="Selected Individual Students" description={`${draft.students.length} selected.`}>
              <div className="max-h-60 overflow-auto rounded-md border border-slate-200 bg-white p-2">
                {filteredStudents.map((student) => (
                  <label key={student.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                    <input checked={draft.students.includes(student.id)} onChange={() => update("students", toggleList(draft.students, student.id))} type="checkbox" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{student.name}</span>
                      <span className="block truncate text-xs text-slate-500">{student.email} - {student.level || "not set"}{student.active ? "" : " - inactive"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Batch-wise Students" description={`${draft.batches.length} batches selected.`}>
              <div className="max-h-60 overflow-auto rounded-md border border-slate-200 bg-white p-2">
                {batches.map((batch) => (
                  <label key={batch.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                    <input checked={draft.batches.includes(batch.id)} onChange={() => update("batches", toggleList(draft.batches, batch.id))} type="checkbox" />
                    <span>{batch.name}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Selected Courses" description={`${draft.courses.length} courses selected.`}>
              <div className="max-h-60 overflow-auto rounded-md border border-slate-200 bg-white p-2">
                {courses.map((course) => (
                  <label key={course.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                    <input checked={draft.courses.includes(course.id)} onChange={() => update("courses", toggleList(draft.courses, course.id))} type="checkbox" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{course.name}</span>
                      <span className="block truncate text-xs text-slate-500">{course.level}{course.levels.length ? ` - ${course.levels.length} levels` : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-4 rounded-md bg-slate-50 p-4">
            <h3 className="mb-3 font-semibold">Selected Levels</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STUDENT_LEVELS.map((level) => (
                <label key={level.value} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                  <input checked={draft.levels.includes(level.value)} onChange={() => update("levels", toggleList(draft.levels, level.value))} type="checkbox" />
                  <span>{level.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 p-4">
            <div className="mb-3 flex items-start gap-3">
              <input checked={draft.externalInviteEnabled} onChange={(event) => update("externalInviteEnabled", event.target.checked)} type="checkbox" className="mt-1" />
              <div>
                <h3 className="font-semibold">External Invitation Access</h3>
                <p className="text-sm text-slate-500">External players receive tournament-only access, not LMS access.</p>
              </div>
            </div>
            {draft.externalInviteEnabled ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Invitation Mode" description="Choose how external participants enter.">
                  <select value={draft.externalInviteMode} onChange={(event) => update("externalInviteMode", event.target.value as InviteMode)} className={textInputClass()}>
                    <option value="public">Public Link</option>
                    <option value="private">Private Link</option>
                    <option value="password">Password-Protected Link</option>
                    <option value="entry_code">Entry-Code Link</option>
                  </select>
                </Field>
                <Field label="Invite Password" description="Required only for password mode." error={mergedErrors.externalInvitePassword}>
                  <input disabled={draft.externalInviteMode !== "password"} value={draft.externalInvitePassword} onChange={(event) => update("externalInvitePassword", event.target.value)} className={textInputClass(Boolean(mergedErrors.externalInvitePassword))} placeholder="Guest password" />
                </Field>
                <Field label="Entry Code" description="Required only for entry-code mode." error={mergedErrors.externalInviteEntryCode}>
                  <input disabled={draft.externalInviteMode !== "entry_code"} value={draft.externalInviteEntryCode} onChange={(event) => update("externalInviteEntryCode", event.target.value)} className={textInputClass(Boolean(mergedErrors.externalInviteEntryCode))} placeholder="ENV-ARENA" />
                </Field>
                <Field label="Invite Expiry" description="Optional expiration date.">
                  <input value={draft.externalInviteExpiresAt} onChange={(event) => update("externalInviteExpiresAt", event.target.value)} type="datetime-local" className={textInputClass()} />
                </Field>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <div className="flex justify-between">
        <button type="button" disabled={step === 1 || pending} onClick={() => setStep((value) => Math.max(1, value - 1))} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm disabled:opacity-40">
          <ArrowLeft size={15} /> Back
        </button>
        {step < 3 ? (
          <button type="button" disabled={pending} onClick={nextStep} className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">
            Next <ArrowRight size={15} />
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={submitAll} className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
            <Trophy size={15} /> {pending ? "Creating..." : "Create Tournament"}
          </button>
        )}
      </div>
    </form>
  );
}
