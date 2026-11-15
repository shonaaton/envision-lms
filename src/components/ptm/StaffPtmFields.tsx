"use client";
import { useEffect, useState } from "react";
import { academyDateTimeLocalInput } from "@/lib/academyTime";
import { LocalTime } from "@/components/common/LocalTime";

type Student = { id: string; name: string; username: string };
type Options = {
  coaches: { id: string; name: string }[];
  credits: { remaining: number; openRequest: string | null; nextEligibleAt: string | null };
  paused: boolean;
};
const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100";

export function StaffPtmFields({ busy, onReady }: { busy: boolean; onReady: (ready: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/ptm/create-options?q=${encodeURIComponent(search)}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) { setStudents(result.students); setError(""); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load students."); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, retry]);
  useEffect(() => {
    onReady(false); setOptions(null);
    if (!selected) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/ptm/create-options?student=${selected.id}`, { signal: controller.signal, cache: "no-store" });
        const result: Options & { error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) { setOptions(result); setError(""); onReady(!result.paused && result.credits.remaining > 0 && !result.credits.openRequest && result.coaches.length > 0); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load coaches."); }
    })();
    return () => controller.abort();
  }, [selected, retry, onReady]);

  return <fieldset disabled={busy} className="space-y-4">
    <label className="block text-sm font-semibold">Search student<input className={field} value={search} onChange={e => { setSearch(e.target.value); setStudents([]); }} placeholder="Student name or username" /></label>
    <label className="block text-sm font-semibold">Student<select name="student" className={field} required value={selected?.id || ""} onChange={e => { onReady(false); setOptions(null); setSelected(students.find(s => s.id === e.target.value) || null); }}>
      <option value="" disabled>Choose student</option>
      {selected && !students.some(s => s.id === selected.id) && <option value={selected.id}>{selected.name}{selected.username ? ` (${selected.username})` : ""}</option>}
      {students.map(s => <option key={s.id} value={s.id}>{s.name}{s.username ? ` (${s.username})` : ""}</option>)}
    </select></label>
    <p role="status" className="text-xs text-slate-500">{searching ? "Searching students…" : !students.length ? "No matching students found." : "Showing up to 50 students. Search to narrow the list."}</p>
    {selected && !options && !error && <p role="status" className="text-sm text-slate-500">Loading coaches and PTM availability…</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error} <button type="button" className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {options && <>
      <div className="rounded-lg bg-purple-50 p-3 text-sm">
        <p>{options.credits.remaining} PTM credits remaining.</p>
        {options.paused ? <p>This student’s enrolment is paused.</p> : options.credits.openRequest ? <p>This student already has an open PTM request. Use the existing request to confirm timing.</p> : !options.coaches.length ? <p>No active coach is assigned in this student’s running classrooms.</p> : options.credits.nextEligibleAt && <p>Next eligible time: <LocalTime value={options.credits.nextEligibleAt} role="admin" /></p>}
      </div>
      <label className="block text-sm font-semibold">Coach<select key={selected?.id} name="coach" className={field} required defaultValue={options.coaches.length === 1 ? options.coaches[0].id : ""}><option value="" disabled>Choose coach</option>{options.coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="block text-sm font-semibold">Preferred date & time (IST)<input name="preferredAt" type="datetime-local" className={field} required min={academyDateTimeLocalInput(new Date(Math.max(Date.now() + 60_000, options.credits.nextEligibleAt ? new Date(options.credits.nextEligibleAt).getTime() : 0)))} /></label>
      <label className="block text-sm font-semibold">Alternative slots (optional)<textarea name="preferredNote" className={field} maxLength={2000} /></label>
      <label className="block text-sm font-semibold">Discussion topic<textarea name="reason" className={field} required minLength={10} maxLength={2000} placeholder="Progress, practice routine, or questions to discuss" /></label>
      <p className="text-xs text-slate-500">The student and coach will be notified. Confirm the final timing and Google Meet link from the new request.</p>
    </>}
  </fieldset>;
}
