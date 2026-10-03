"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Plus, Save, Trash2, X } from "lucide-react";

import {
  LANGUAGE_OPTIONS,
  MAX_NOTE_LENGTH,
  WEEK_DAYS,
  normalizeLanguages,
  type AvailabilitySlot,
  type CoachProfileView,
} from "@/lib/coachProfile";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };
type DraftSlot = AvailabilitySlot & { key: number };

let nextKey = 1;
const withKey = (slot: AvailabilitySlot): DraftSlot => ({ ...slot, key: nextKey++ });

export function CoachProfileForm({
  coachId,
  coachName,
  isSelf,
  profile,
  saveAction,
}: {
  coachId: string;
  coachName: string;
  isSelf: boolean;
  profile: CoachProfileView;
  saveAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [languages, setLanguages] = useState<string[]>(profile.languages);
  const [custom, setCustom] = useState("");
  const [slots, setSlots] = useState<DraftSlot[]>(() => profile.availability.map(withKey));
  const [note, setNote] = useState(profile.availabilityNote);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const extraLanguages = languages.filter((language) => !(LANGUAGE_OPTIONS as readonly string[]).includes(language));

  function toggleLanguage(language: string) {
    setSaved("");
    setLanguages((current) => (current.includes(language) ? current.filter((item) => item !== language) : [...current, language]));
  }

  function addCustomLanguage() {
    const typed = custom.replace(/\s+/g, " ").trim();
    if (!typed) return;
    // Same spelling the server stores: a listed language as listed, anything else capitalised.
    const value = normalizeLanguages([typed])[0];
    setSaved("");
    setLanguages((current) => (current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]));
    setCustom("");
  }

  function addSlot(dayOfWeek: number) {
    setSaved("");
    const sameDay = slots.filter((slot) => slot.dayOfWeek === dayOfWeek);
    const last = sameDay[sameDay.length - 1];
    // A second slot on a day starts where the first ended; a first slot gets a sensible evening default.
    const startTime = last && last.endTime < "22:00" ? last.endTime : "17:00";
    const [h, m] = startTime.split(":").map(Number);
    const endTime = `${String(Math.min(h + 2, 23)).padStart(2, "0")}:${h + 2 > 23 ? "59" : String(m).padStart(2, "0")}`;
    setSlots((current) => [...current, withKey({ dayOfWeek, startTime, endTime })]);
  }

  function copyToWeekdays(dayOfWeek: number) {
    setSaved("");
    const source = slots.filter((slot) => slot.dayOfWeek === dayOfWeek);
    const weekdays = [1, 2, 3, 4, 5].filter((day) => day !== dayOfWeek);
    setSlots((current) => [
      ...current.filter((slot) => !weekdays.includes(slot.dayOfWeek)),
      ...weekdays.flatMap((day) => source.map((slot) => withKey({ dayOfWeek: day, startTime: slot.startTime, endTime: slot.endTime }))),
    ]);
  }

  function updateSlot(key: number, patch: Partial<AvailabilitySlot>) {
    setSaved("");
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(key: number) {
    setSaved("");
    setSlots((current) => current.filter((slot) => slot.key !== key));
  }

  function submit() {
    setError("");
    const formData = new FormData();
    formData.set("coach", coachId);
    formData.set("languages", JSON.stringify(languages));
    formData.set("availability", JSON.stringify(slots.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))));
    formData.set("availabilityNote", note);
    startTransition(async () => {
      const result = await saveAction(formData);
      if (!result.ok) {
        setSaved("");
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setSaved(result.message);
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {saved && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {saved}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900" role="alert">
          {error}
        </div>
      )}

      <section className="grid gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-950">Languages {isSelf ? "you can" : `${coachName} can`} teach in</h3>
          <p className="text-xs text-slate-500">Tap to select. Add any language that is not listed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...LANGUAGE_OPTIONS, ...extraLanguages].map((language) => {
            const active = languages.includes(language);
            return (
              <button
                key={language}
                type="button"
                aria-pressed={active}
                onClick={() => toggleLanguage(language)}
                className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold ring-1 transition ${
                  active ? "bg-brand text-white ring-brand" : "bg-white text-slate-700 ring-slate-200 hover:ring-brand/50"
                }`}
              >
                {active && <CheckCircle2 size={13} />} {language}
              </button>
            );
          })}
        </div>
        <div className="flex max-w-sm gap-2">
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomLanguage();
              }
            }}
            maxLength={40}
            placeholder="Other language"
            aria-label="Other language"
            className="input h-9 flex-1"
          />
          <button type="button" onClick={addCustomLanguage} className="btn-outline h-9 px-3 text-xs" disabled={!custom.trim()}>
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      <section className="grid gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-950">Times {isSelf ? "you are" : `${coachName} is`} available to teach</h3>
          <p className="text-xs text-slate-500">Every week, in Indian time (IST). Add more than one slot on a day if there is a break.</p>
        </div>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {WEEK_DAYS.map((day) => {
            const daySlots = slots.filter((slot) => slot.dayOfWeek === day.day);
            return (
              <div key={day.day} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                <div className="w-28 shrink-0 pt-1.5 text-sm font-semibold text-slate-800">{day.label}</div>
                <div className="grid flex-1 gap-2">
                  {daySlots.length === 0 && <div className="pt-1.5 text-xs text-slate-400">Not available</div>}
                  {daySlots.map((slot) => (
                    <div key={slot.key} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(event) => updateSlot(slot.key, { startTime: event.target.value })}
                        aria-label={`${day.label} from`}
                        className="input h-9 w-32"
                        required
                      />
                      <span className="text-xs text-slate-500">to</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(event) => updateSlot(slot.key, { endTime: event.target.value })}
                        aria-label={`${day.label} until`}
                        className="input h-9 w-32"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.key)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove ${day.label} slot`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button type="button" onClick={() => addSlot(day.day)} className="btn-outline h-8 px-3 text-xs">
                    <Plus size={13} /> Add time
                  </button>
                  {daySlots.length > 0 && day.day >= 1 && day.day <= 5 && (
                    <button
                      type="button"
                      onClick={() => copyToWeekdays(day.day)}
                      className="h-8 rounded-md px-2 text-xs font-semibold text-brand hover:bg-brand/5"
                      title="Replace Monday to Friday with these times"
                    >
                      Copy to Mon-Fri
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {slots.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSaved("");
              setSlots([]);
            }}
            className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600"
          >
            <X size={13} /> Clear all times
          </button>
        )}
      </section>

      <label className="grid gap-1 text-sm font-bold text-slate-950">
        Anything else about availability
        <span className="text-xs font-normal text-slate-500">Optional - e.g. &quot;Not available during exams in March&quot;.</span>
        <textarea
          value={note}
          onChange={(event) => {
            setSaved("");
            setNote(event.target.value);
          }}
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
          className="input min-h-20 py-2 font-normal"
        />
      </label>

      <div>
        <button type="submit" className="btn-primary h-10 px-5 text-sm" disabled={pending}>
          <Save size={15} /> {pending ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
