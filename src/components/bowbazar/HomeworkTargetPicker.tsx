"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type BranchTargets = {
  slots: { id: string; label: string; mode: string; students: number; withLogin: number }[];
  students: { id: string; name: string; regNo: string; levelName: string; hasLogin: boolean; slotIds: string[] }[];
};
export type BranchTargetValue = { slotIds: string[]; studentIds: string[] };

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

/** Whole Bowbazar classes (centre and online) and/or chosen students, for homework. */
export default function BranchTargetPicker({ targets, value, onChange }: { targets: BranchTargets; value: BranchTargetValue; onChange: (value: BranchTargetValue) => void }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const levels = useMemo(() => Array.from(new Set(targets.students.map((student) => student.levelName).filter(Boolean))).sort(), [targets.students]);
  const shown = targets.students.filter(
    (student) =>
      (!level || student.levelName === level) &&
      `${student.name} ${student.regNo} ${student.levelName}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  // Who will actually get it: logins of the picked classes' students and the picked students.
  const summary = useMemo(() => {
    const picked = targets.students.filter(
      (student) => value.studentIds.includes(student.id) || student.slotIds.some((slotId) => value.slotIds.includes(slotId))
    );
    return { get: picked.filter((student) => student.hasLogin).length, noLogin: picked.filter((student) => !student.hasLogin).map((student) => student.name) };
  }, [targets.students, value]);

  const centre = targets.slots.filter((slot) => slot.mode !== "online");
  const online = targets.slots.filter((slot) => slot.mode === "online");

  return (
    <div className="space-y-3 text-sm">
      {[
        { title: "Centre classes", list: centre },
        { title: "Online classes", list: online },
      ].map((group) =>
        group.list.length ? (
          <div key={group.title}>
            <div className="mb-1 text-xs font-bold text-slate-600">{group.title} <span className="font-normal text-slate-400">(every active student in it)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {group.list.map((slot) => {
                const on = value.slotIds.includes(slot.id);
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => onChange({ ...value, slotIds: toggle(value.slotIds, slot.id) })}
                    className={cn("rounded-full px-3 py-1 text-xs font-bold ring-1 transition", on ? "bg-brand text-white ring-brand" : "bg-white text-slate-700 ring-slate-200 hover:bg-brand-50")}
                    aria-pressed={on}
                  >
                    {slot.label} <span className="opacity-70">· {slot.students}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}

      <div>
        <div className="mb-1 text-xs font-bold text-slate-600">Specific students</div>
        <div className="mb-2 flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or registration no." />
          </div>
          {levels.length > 0 && (
            <select className="input h-9 w-auto" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Level">
              <option value="">All levels</option>
              {levels.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {shown.length > 0 && (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
              onClick={() => {
                const ids = shown.map((student) => student.id);
                const allOn = ids.every((studentId) => value.studentIds.includes(studentId));
                onChange({ ...value, studentIds: allOn ? value.studentIds.filter((studentId) => !ids.includes(studentId)) : Array.from(new Set([...value.studentIds, ...ids])) });
              }}
            >
              {shown.every((student) => value.studentIds.includes(student.id)) ? "Untick shown" : "Tick shown"}
            </button>
          )}
        </div>
        <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((student) => (
            <label
              key={student.id}
              className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5", value.studentIds.includes(student.id) ? "border-brand/40 bg-brand-50" : "border-slate-200 bg-white")}
            >
              <input type="checkbox" className="mt-0.5" checked={value.studentIds.includes(student.id)} onChange={() => onChange({ ...value, studentIds: toggle(value.studentIds, student.id) })} />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-800">{student.name}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {[student.regNo, student.levelName].filter(Boolean).join(" · ") || " "}
                  {!student.hasLogin && <span className="ml-1 font-bold text-amber-700">no login</span>}
                </span>
              </span>
            </label>
          ))}
          {!shown.length && <p className="text-xs text-slate-500">No students match.</p>}
        </div>
      </div>

      <p className={cn("rounded-lg px-3 py-2 text-xs", summary.get ? "bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-500")}>
        {summary.get ? <><span className="font-bold">{summary.get} student{summary.get === 1 ? "" : "s"}</span> will get it.</> : "Pick a class or students."}
        {summary.noLogin.length > 0 && <span className="text-amber-800"> {summary.noLogin.length} without a login will be skipped ({summary.noLogin.slice(0, 4).join(", ")}{summary.noLogin.length > 4 ? "..." : ""}).</span>}
      </p>
    </div>
  );
}
