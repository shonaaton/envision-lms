"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { ArrowLeft, ArrowRight, Trophy } from "lucide-react";

type TournamentType = "swiss" | "arena";
type BatchOption = { id: string; name: string };
type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};
type ServerAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type Draft = {
  name: string;
  description: string;
  type: TournamentType;
  arenaDurationMinutes: string;
  rounds: string;
  breakBetweenRoundsMinutes: string;
  timeControlMinutes: string;
  incrementSeconds: string;
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
};

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
  }
  if (step >= 3) {
    if (!draft.allActiveStudents && !draft.includeCoaches && !draft.includeInactiveStudents && draft.batches.length === 0) {
      errors.access = "Select at least one access group.";
    }
  }
  return errors;
}

export default function TournamentCreateForm({
  batches,
  action,
  error,
}: {
  batches: BatchOption[];
  action: ServerAction;
  error?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({
    name: "",
    description: "",
    type: "arena",
    arenaDurationMinutes: "",
    rounds: "",
    breakBetweenRoundsMinutes: "0",
    timeControlMinutes: "",
    incrementSeconds: "0",
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
  });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [state, formAction] = useFormState(action, { error });
  const mergedErrors = useMemo(() => ({ ...state.fieldErrors, ...localErrors }), [state.fieldErrors, localErrors]);

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
  }

  function toggleBatch(id: string) {
    update(
      "batches",
      draft.batches.includes(id) ? draft.batches.filter((item) => item !== id) : [...draft.batches, id]
    );
  }

  function nextStep() {
    const nextErrors = buildClientErrors(draft, step);
    const relevant = Object.keys(nextErrors).filter((key) => {
      if (step === 1) return ["name", "type"].includes(key);
      if (step === 2) return ["arenaDurationMinutes", "rounds", "timeControlMinutes", "startDate", "startTime", "customFen"].includes(key);
      return key === "access";
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

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {(state.error || error) ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error || error}</div> : null}

      <input type="hidden" name="name" value={draft.name} />
      <input type="hidden" name="description" value={draft.description} />
      <input type="hidden" name="type" value={draft.type} />
      <input type="hidden" name="arenaDurationMinutes" value={draft.arenaDurationMinutes} />
      <input type="hidden" name="rounds" value={draft.rounds} />
      <input type="hidden" name="breakBetweenRoundsMinutes" value={draft.breakBetweenRoundsMinutes} />
      <input type="hidden" name="timeControlMinutes" value={draft.timeControlMinutes} />
      <input type="hidden" name="incrementSeconds" value={draft.incrementSeconds} />
      <input type="hidden" name="startDate" value={draft.startDate} />
      <input type="hidden" name="startTime" value={draft.startTime} />
      <input type="hidden" name="repeatEnabled" value={draft.repeatEnabled ? "yes" : "no"} />
      <input type="hidden" name="repeatUntilDate" value={draft.repeatUntilDate} />
      <input type="hidden" name="repeatDays" value={draft.repeatDays} />
      <input type="hidden" name="repeatCount" value={draft.repeatCount} />
      <input type="hidden" name="repeatDaily" value={draft.repeatDaily ? "yes" : "no"} />
      <input type="hidden" name="startingPositionType" value={draft.startingPositionType} />
      <input type="hidden" name="customFen" value={draft.customFen} />
      <input type="hidden" name="allActiveStudents" value={draft.allActiveStudents ? "yes" : ""} />
      <input type="hidden" name="includeCoaches" value={draft.includeCoaches ? "yes" : ""} />
      <input type="hidden" name="includeInactiveStudents" value={draft.includeInactiveStudents ? "yes" : ""} />
      {draft.batches.map((batchId) => <input key={batchId} type="hidden" name="batches" value={batchId} />)}

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
            <Field label="Tournament Name" description="Enter the public name students will see on their dashboard." error={mergedErrors.name}>
              <input value={draft.name} onChange={(event) => update("name", event.target.value)} className={textInputClass(Boolean(mergedErrors.name))} placeholder="Beginner Practice Arena" />
            </Field>
            <Field label="Tournament Type" description="Choose Swiss for fixed rounds or Arena for duration-based play." error={mergedErrors.type}>
              <select value={draft.type} onChange={(event) => update("type", event.target.value as TournamentType)} className={textInputClass(Boolean(mergedErrors.type))}>
                <option value="arena">Arena</option>
                <option value="swiss">Swiss</option>
              </select>
            </Field>
            <Field label="Tournament Description" description="Optional details, rules, or instructions for participants.">
              <textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Practice tournament for beginner students" className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
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
            <Field label="Starting Position Option" description="Choose normal chess start or provide a custom FEN.">
              <select value={draft.startingPositionType} onChange={(event) => update("startingPositionType", event.target.value as "normal" | "custom")} className={textInputClass()}>
                <option value="normal">Normal Starting Position</option>
                <option value="custom">Custom Starting Position</option>
              </select>
            </Field>
            {draft.startingPositionType === "custom" && (
              <Field label="Custom FEN" description="Paste the starting FEN for this tournament." error={mergedErrors.customFen}>
                <input value={draft.customFen} onChange={(event) => update("customFen", event.target.value)} className={textInputClass(Boolean(mergedErrors.customFen))} placeholder="rnbqkbnr/pppppppp/8/8/..." />
              </Field>
            )}
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <input checked={draft.allActiveStudents} onChange={(event) => update("allActiveStudents", event.target.checked)} type="checkbox" className="mt-1" />
              <span><b>All Active Students</b><br /><small className="text-slate-500">Every active student can view and join.</small></span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <input checked={draft.includeCoaches} onChange={(event) => update("includeCoaches", event.target.checked)} type="checkbox" className="mt-1" />
              <span><b>Coaches</b><br /><small className="text-slate-500">Allow coaches to view tournament access.</small></span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <input checked={draft.includeInactiveStudents} onChange={(event) => update("includeInactiveStudents", event.target.checked)} type="checkbox" className="mt-1" />
              <span><b>Inactive Students</b><br /><small className="text-slate-500">Include inactive student profiles too.</small></span>
            </label>
            <Field label="Batch-wise Students" description={mergedErrors.access || "Select one or more batches whose students should get access."} error={mergedErrors.access}>
              <div className={`max-h-48 overflow-auto rounded-md border p-2 ${mergedErrors.access ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
                <div className="grid gap-2">
                  {batches.map((batch) => (
                    <label key={batch.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                      <input checked={draft.batches.includes(batch.id)} onChange={() => toggleBatch(batch.id)} type="checkbox" />
                      <span>{batch.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </Field>
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
