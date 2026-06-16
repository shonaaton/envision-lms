"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Trophy } from "lucide-react";

type TournamentType = "swiss" | "arena";
type BatchOption = { id: string; name: string };
type ServerAction = (formData: FormData) => Promise<void>;

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      {children}
      <span className="block text-xs leading-5 text-slate-500">{description}</span>
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />;
}

export default function TournamentCreateForm({ batches, action, error }: { batches: BatchOption[]; action: ServerAction; error?: string }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<TournamentType>("arena");
  const [repeat, setRepeat] = useState(false);
  const [position, setPosition] = useState<"normal" | "custom">("normal");

  return (
    <form action={action} className="space-y-5">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="repeatEnabled" value={repeat ? "yes" : "no"} />
      <input type="hidden" name="startingPositionType" value={position} />
      <div className="grid grid-cols-3 gap-2 text-sm">
        {["Basic Details", `${type === "arena" ? "Arena" : "Swiss"} Setup`, "Access"].map((label, index) => (
          <div key={label} className={`rounded-md px-3 py-2 text-center font-medium ${step === index + 1 ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-600"}`}>Step {index + 1}: {label}</div>
        ))}
      </div>

      {step === 1 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Step 1: Basic Tournament Details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Tournament Name" description="Enter the public name students will see on their dashboard.">
              <Input name="name" required placeholder="Beginner Practice Arena" />
            </Field>
            <Field label="Tournament Type" description="Choose Swiss for fixed rounds or Arena for duration-based play.">
              <select value={type} onChange={(event) => setType(event.target.value as TournamentType)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="arena">Arena</option>
                <option value="swiss">Swiss</option>
              </select>
            </Field>
            <Field label="Tournament Description" description="Optional details, rules, or instructions for participants.">
              <textarea name="description" placeholder="Practice tournament for beginner students" className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
            </Field>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Step 2: {type === "arena" ? "Arena" : "Swiss"} Tournament Setup</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {type === "arena" ? (
              <Field label="Total Arena Duration" description="Total playing time for the arena in minutes.">
                <Input name="arenaDurationMinutes" type="number" min="1" placeholder="60" />
              </Field>
            ) : (
              <>
                <Field label="Number of Rounds" description="Total Swiss rounds to be paired and played.">
                  <Input name="rounds" type="number" min="1" placeholder="5" />
                </Field>
                <Field label="Break Between Rounds" description="Break duration between Swiss rounds in minutes.">
                  <Input name="breakBetweenRoundsMinutes" type="number" min="0" placeholder="5" />
                </Field>
              </>
            )}
            <Field label="Time Control" description="Base time per player in minutes.">
              <Input name="timeControlMinutes" type="number" min="1" required placeholder="10" />
            </Field>
            <Field label="Increment" description="Increment per move in seconds.">
              <Input name="incrementSeconds" type="number" min="0" defaultValue={0} placeholder="0" />
            </Field>
            <Field label="Start Date" description="The calendar date when the tournament starts.">
              <Input name="startDate" type="date" required />
            </Field>
            <Field label="Start Time" description="The local start time students will see.">
              <Input name="startTime" type="time" required />
            </Field>
            <Field label="Repeat Tournament Option" description="Enable if this tournament should be generated on multiple dates.">
              <select value={repeat ? "yes" : "no"} onChange={(event) => setRepeat(event.target.value === "yes")} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="no">Do not repeat</option>
                <option value="yes">Repeat tournament</option>
              </select>
            </Field>
            <Field label="Starting Position Option" description="Choose normal chess start or provide a custom FEN.">
              <select value={position} onChange={(event) => setPosition(event.target.value as "normal" | "custom")} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="normal">Normal Starting Position</option>
                <option value="custom">Custom Starting Position</option>
              </select>
            </Field>
            {position === "custom" && (
              <Field label="Custom FEN" description="Paste the starting FEN for this tournament.">
                <Input name="customFen" placeholder="rnbqkbnr/pppppppp/8/8/..." />
              </Field>
            )}
          </div>

          {repeat && (
            <div className="mt-4 rounded-md bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold">Repeat Tournament Settings</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Repeat Until Date" description="Stop generating repeated tournaments after this date."><Input name="repeatUntilDate" type="date" /></Field>
                <Field label="Repeat on Selected Days" description="Use numbers 0-6 for Sun-Sat, comma separated."><Input name="repeatDays" placeholder="1,3,5" /></Field>
                <Field label="Number of Times to Repeat" description="Maximum number of tournament copies to create."><Input name="repeatCount" type="number" min="1" placeholder="5" /></Field>
                <Field label="Daily Repeat Option" description="Choose yes to repeat every day.">
                  <select name="repeatDaily" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="no">No</option><option value="yes">Yes</option></select>
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
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3"><input name="allActiveStudents" type="checkbox" className="mt-1" /> <span><b>All Active Students</b><br /><small className="text-slate-500">Every active student can view and join.</small></span></label>
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3"><input name="includeCoaches" type="checkbox" className="mt-1" /> <span><b>Coaches</b><br /><small className="text-slate-500">Allow coaches to view tournament access.</small></span></label>
            <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3"><input name="includeInactiveStudents" type="checkbox" className="mt-1" /> <span><b>Inactive Students</b><br /><small className="text-slate-500">Include inactive student profiles too.</small></span></label>
            <Field label="Batch-wise Students" description="Select one or more batches whose students should get access.">
              <select name="batches" multiple className="min-h-28 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
              </select>
            </Field>
          </div>
        </section>
      )}

      <div className="flex justify-between">
        <button type="button" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm disabled:opacity-40"><ArrowLeft size={15} /> Back</button>
        {step < 3 ? (
          <button type="button" onClick={() => setStep((value) => Math.min(3, value + 1))} className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">Next <ArrowRight size={15} /></button>
        ) : (
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white"><Trophy size={15} /> Create Tournament</button>
        )}
      </div>
    </form>
  );
}
