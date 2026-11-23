"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { callWindow, type StudentTimeZone } from "@/lib/localTime/studentTimeZone";

export type LocalTimeInfo = StudentTimeZone | null;
export type LocalTimeEditTarget = { target: "user" | "lead"; id: string };

// One shared clock for every badge on the page, ticking on the minute.
let listeners = new Set<(now: Date) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  const now = new Date();
  timer = setTimeout(() => {
    const tick = new Date();
    listeners.forEach((listener) => listener(tick));
    schedule();
  }, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
}

function useMinuteClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    listeners.add(setNow);
    if (!timer) schedule();
    return () => {
      listeners.delete(setNow);
      if (!listeners.size && timer) {
        clearTimeout(timer);
        timer = null;
        listeners = new Set();
      }
    };
  }, []);
  return now;
}

const WINDOW_STYLE = {
  good: { className: "bg-emerald-50 text-emerald-800 ring-emerald-200", note: "good time to call" },
  edge: { className: "bg-amber-50 text-amber-800 ring-amber-200", note: "early or late - call only if expected" },
  bad: { className: "bg-rose-50 text-rose-800 ring-rose-200", note: "night there - do not call" },
} as const;

function sourceNote(info: StudentTimeZone) {
  const base =
    info.source === "device" ? "From the family's own device (their last portal visit, or the demo form)"
    : info.source === "staff" ? `Confirmed with the family, ${info.basis}`
    : info.source === "phone" ? `Guessed from the ${info.basis}`
    : info.source === "area_code" ? `From the phone number's ${info.basis}`
    : `From the ${info.source} on the account: ${info.basis}`;
  return info.approximate ? `${base}. This place has more than one time zone, so it may be off by an hour or more` : base;
}

function cityOf(zone: string) {
  return (zone.split("/").pop() || zone).replace(/_/g, " ");
}

/** The zones staff pick most, then every zone the browser knows. */
const COMMON_ZONES: Array<{ zone: string; label: string }> = [
  { zone: "Asia/Kolkata", label: "India (IST)" },
  { zone: "America/New_York", label: "US / Canada Eastern (New York, Toronto)" },
  { zone: "America/Chicago", label: "US / Canada Central (Chicago, Dallas, Winnipeg)" },
  { zone: "America/Denver", label: "US / Canada Mountain (Denver, Calgary)" },
  { zone: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { zone: "America/Los_Angeles", label: "US / Canada Pacific (LA, Seattle, Vancouver)" },
  { zone: "America/Anchorage", label: "Alaska" },
  { zone: "Pacific/Honolulu", label: "Hawaii" },
  { zone: "America/Halifax", label: "Canada Atlantic (Halifax)" },
  { zone: "America/St_Johns", label: "Newfoundland" },
  { zone: "America/Regina", label: "Saskatchewan" },
  { zone: "Australia/Sydney", label: "Australia: Sydney, Canberra" },
  { zone: "Australia/Melbourne", label: "Australia: Melbourne" },
  { zone: "Australia/Brisbane", label: "Australia: Brisbane (no daylight saving)" },
  { zone: "Australia/Adelaide", label: "Australia: Adelaide" },
  { zone: "Australia/Darwin", label: "Australia: Darwin" },
  { zone: "Australia/Perth", label: "Australia: Perth" },
  { zone: "Australia/Hobart", label: "Australia: Hobart" },
  { zone: "Europe/London", label: "United Kingdom" },
  { zone: "Europe/Berlin", label: "Central Europe" },
  { zone: "Asia/Dubai", label: "UAE / Oman" },
  { zone: "Asia/Riyadh", label: "Saudi Arabia / Kuwait" },
  { zone: "Asia/Qatar", label: "Qatar / Bahrain" },
  { zone: "Asia/Singapore", label: "Singapore / Malaysia" },
  { zone: "Pacific/Auckland", label: "New Zealand" },
];

function allZones(): string[] {
  try {
    return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  } catch {
    return [];
  }
}

/**
 * The family's clock right now, coloured by whether it is a sensible time to
 * ring them. Shown wherever staff see a family they may call. With `edit`,
 * staff can click it and set the exact zone after asking the family; an
 * approximate or unknown zone also gets a "Set exact zone" link.
 */
export default function LocalTime({ info: initial, size = "sm", edit }: { info: LocalTimeInfo; size?: "sm" | "md"; edit?: LocalTimeEditTarget }) {
  const now = useMinuteClock();
  const [info, setInfo] = useState<LocalTimeInfo>(initial);
  const [open, setOpen] = useState(false);
  useEffect(() => setInfo(initial), [initial]);

  const padding = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  const iconSize = size === "md" ? 14 : 12;
  const needsExact = !info || info.approximate;

  let body: React.ReactNode;
  let tone: string;
  let title: string;
  if (!info) {
    tone = "bg-slate-50 text-slate-600 ring-slate-300";
    title = `Nothing on the account says where the family is.${edit ? " Click to set their time zone." : ""}`;
    body = (
      <>
        <Clock size={iconSize} /> Local time unknown
      </>
    );
  } else if (!now) {
    return null;
  } else {
    const time = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: info.timeZone });
    const day = now.toLocaleDateString("en-IN", { weekday: "short", timeZone: info.timeZone });
    const ourDay = now.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
    const style = WINDOW_STYLE[callWindow(info.timeZone, now)];
    const isIst = info.timeZone === "Asia/Kolkata" || info.timeZone === "Asia/Calcutta";
    const place = info.source === "city" || info.source === "state" || info.source === "country" ? info.basis : cityOf(info.timeZone);
    tone = style.className;
    title = `${time} ${day} for the family (${info.timeZone}), ${style.note}. ${sourceNote(info)}.${edit ? " Click to set the exact zone." : ""}`;
    body = (
      <>
        <Clock size={iconSize} />
        {time}
        {day !== ourDay ? ` ${day}` : ""}
        <span className="font-normal opacity-80">
          {isIst ? " IST" : ` ${place}`}
          {info.approximate ? " (approx.)" : ""}
        </span>
      </>
    );
  }

  const badgeClass = `inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 tabular-nums ${tone} ${padding}`;
  if (!edit) {
    return (
      <span className={badgeClass} title={title}>
        {body}
      </span>
    );
  }

  return (
    <span className="relative inline-flex flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <button type="button" className={`${badgeClass} hover:brightness-95`} title={title} onClick={() => setOpen((value) => !value)}>
        {body}
      </button>
      {needsExact && (
        <button type="button" className="whitespace-nowrap text-[11px] font-bold text-brand underline underline-offset-2" onClick={() => setOpen(true)}>
          Set exact zone
        </button>
      )}
      {open && (
        <ZonePicker
          edit={edit}
          current={info}
          onClose={() => setOpen(false)}
          onSaved={(next) => {
            setInfo(next);
            setOpen(false);
          }}
        />
      )}
    </span>
  );
}

function ZonePicker({ edit, current, onClose, onSaved }: { edit: LocalTimeEditTarget; current: LocalTimeInfo; onClose: () => void; onSaved: (info: LocalTimeInfo) => void }) {
  const [zone, setZone] = useState(current && !current.approximate ? current.timeZone : "");
  const [busy, setBusy] = useState(false);
  const others = useMemo(() => {
    const common = new Set(COMMON_ZONES.map((item) => item.zone));
    return allZones().filter((item) => !common.has(item));
  }, []);

  async function save(value: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/local-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...edit, timeZone: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error || "Could not save the time zone.");
        return;
      }
      toast.success(value ? "Time zone saved for the whole team" : "Back to the automatic time zone");
      onSaved(payload.localTime ?? null);
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal text-slate-700 shadow-xl"
      role="dialog"
      aria-label="Set the family's time zone"
    >
      <p className="font-bold text-slate-900">Where is the family?</p>
      <p className="mt-0.5 text-slate-500">
        Ask them, then pick their zone. It is saved for the whole team{edit.target === "user" ? " and for siblings on the same number" : ""}.
      </p>
      <select className="input mt-2 w-full !py-1.5 text-xs" value={zone} onChange={(event) => setZone(event.target.value)} autoFocus>
        <option value="">Choose a time zone</option>
        <optgroup label="Common">
          {COMMON_ZONES.map((item) => (
            <option key={item.zone} value={item.zone}>
              {item.label}
            </option>
          ))}
        </optgroup>
        {others.length > 0 && (
          <optgroup label="All time zones">
            {others.map((item) => (
              <option key={item} value={item}>
                {item.replace(/_/g, " ")}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary !px-3 !py-1 text-xs" disabled={!zone || busy} onClick={() => save(zone)}>
          Save
        </button>
        <button type="button" className="btn btn-outline !px-3 !py-1 text-xs" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        {current?.source === "staff" && (
          <button type="button" className="ml-auto text-[11px] font-semibold text-slate-500 hover:underline" disabled={busy} onClick={() => save("")}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
