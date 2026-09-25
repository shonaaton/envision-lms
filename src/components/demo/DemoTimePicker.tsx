"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Globe2 } from "lucide-react";
import { ACADEMY_TIME_ZONE } from "@/lib/academyTime";
import {
  describeInZone,
  demoTimeOptions,
  sameClockAsAcademy,
  timeZoneChoices,
  upcomingDemoDays,
  type DemoPeriod,
} from "@/lib/demoTimeSlots";

export type DemoTimeValue = { date: string; time: string; timezone: string };

const PERIODS: DemoPeriod[] = ["Morning", "Afternoon", "Evening", "Night", "Early morning"];

/**
 * Day buttons, then half-hour time buttons for that day in the family's own
 * timezone. Only times at least half an hour away are offered, so everything a
 * parent can tap is a time the server will accept.
 */
export function DemoTimePicker({
  value,
  onChange,
  detectedTimeZone,
}: {
  value: DemoTimeValue;
  onChange: (next: DemoTimeValue) => void;
  detectedTimeZone: string;
}) {
  const [now, setNow] = useState(() => new Date());
  const [showEarly, setShowEarly] = useState(false);

  // Keep "today" honest if the page is left open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const zones = useMemo(() => timeZoneChoices(detectedTimeZone), [detectedTimeZone]);
  const days = useMemo(() => upcomingDemoDays(value.timezone, 14, now), [value.timezone, now]);
  const times = useMemo(
    () => (value.date ? demoTimeOptions(value.date, value.timezone, now) : []),
    [value.date, value.timezone, now]
  );
  const selected = times.find((option) => option.time === value.time) || null;

  // Today can run out of times, and a picked time can slip into the past while
  // the page sits open: drop the choice rather than submit something stale.
  useEffect(() => {
    if (value.date && !days.some((day) => day.key === value.date)) {
      onChange({ ...value, date: "", time: "" });
    } else if (value.time && !selected) {
      onChange({ ...value, time: "" });
    }
  }, [days, selected, value, onChange]);

  const grouped = PERIODS.map((period) => ({ period, options: times.filter((option) => option.period === period) }))
    .filter((group) => group.options.length > 0);
  const hasEarly = grouped.some((group) => group.period === "Early morning");
  const visibleGroups = grouped.filter((group) => showEarly || group.period !== "Early morning" || value.time.startsWith("0"));
  const differsFromAcademy = !sameClockAsAcademy(value.timezone, now);

  return (
    <div className="mt-4 space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-white">1</span>
          Pick a day
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((day) => {
            const active = day.key === value.date;
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => onChange({ ...value, date: day.key, time: "" })}
                aria-pressed={active}
                className={`flex min-w-[76px] shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-center transition ${
                  active ? "border-brand bg-brand text-white shadow-md" : "border-slate-200 bg-white text-slate-800 hover:border-brand/50"
                }`}
              >
                <span className={`text-[11px] font-bold uppercase ${active ? "text-white/80" : "text-slate-500"}`}>{day.relative || day.weekday}</span>
                <span className="text-sm font-black">{day.dayMonth}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-white">2</span>
          Pick a time
        </div>
        {!value.date ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
            <CalendarDays size={16} className="mr-1 inline" /> Choose a day above to see the times.
          </div>
        ) : times.length === 0 ? (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-sm text-amber-800">
            No more times left today. Please pick another day.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleGroups.map((group) => (
              <div key={group.period}>
                <div className="mb-1.5 text-xs font-semibold text-slate-500">{group.period}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {group.options.map((option) => {
                    const active = option.time === value.time;
                    return (
                      <button
                        key={option.time}
                        type="button"
                        onClick={() => onChange({ ...value, time: option.time })}
                        aria-pressed={active}
                        className={`h-10 rounded-lg border text-sm font-bold transition ${
                          active ? "border-brand bg-brand text-white shadow-md" : "border-slate-200 bg-white text-slate-800 hover:border-brand/50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {hasEarly && !showEarly && !value.time.startsWith("0") ? (
              <button type="button" onClick={() => setShowEarly(true)} className="text-xs font-bold text-brand underline-offset-2 hover:underline">
                Show early-morning times (12 AM - 6 AM)
              </button>
            ) : null}
          </div>
        )}
      </div>

      <label className="block space-y-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Globe2 size={14} /> Your timezone
        </span>
        <select
          value={value.timezone}
          onChange={(event) => onChange({ ...value, timezone: event.target.value, time: "" })}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          {["Your device", "Common", "All time zones"].map((group) => (
            <optgroup key={group} label={group}>
              {zones.filter((zone) => zone.group === group).map((zone) => (
                <option key={zone.zone} value={zone.zone}>{zone.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="block text-xs text-slate-500">Times above are shown in this timezone. Change it only if you are booking for a different place.</span>
      </label>

      {selected ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-black"><Clock3 size={16} /> {describeInZone(selected.start, value.timezone)}</div>
          {differsFromAcademy ? (
            <div className="mt-1 text-xs font-semibold text-emerald-800">
              That is {describeInZone(selected.start, ACADEMY_TIME_ZONE)} in India (IST).
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
