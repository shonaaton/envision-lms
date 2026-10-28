"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { DAY_NAMES, WEEK_ORDER } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { BranchHeader, Drawer, Field, ModeBadge, api } from "./shared";

export type Slot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string;
  mode: "online" | "offline";
  capacity: number;
  meetingUrl: string;
  isActive: boolean;
  filled: number;
  free: number;
  students: { id: string; name: string }[];
};

function fullness(slot: Slot) {
  if (!slot.isActive) return "border-slate-200 bg-slate-50 opacity-60";
  if (slot.free === 0) return "border-red-200 bg-red-50";
  if (slot.free <= 2) return "border-amber-200 bg-amber-50";
  return "border-emerald-200 bg-emerald-50";
}

export default function SlotsClient({ can }: { can: string[] }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onlyFree, setOnlyFree] = useState(false);
  const [editing, setEditing] = useState<Partial<Slot> | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ slots: Slot[]; canEdit: boolean }>("/api/bowbazar/slots");
      setSlots(data.slots);
      setCanEdit(data.canEdit);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(
    () =>
      WEEK_ORDER.map((day) => ({
        day,
        slots: slots.filter((slot) => slot.dayOfWeek === day && (!onlyFree || (slot.isActive && slot.free > 0))),
      })).filter((entry) => entry.slots.length),
    [slots, onlyFree]
  );
  const open = slots.filter((slot) => slot.isActive);
  const free = open.reduce((sum, slot) => sum + slot.free, 0);

  async function seed() {
    setSeeding(true);
    try {
      const data = await api<{ created: number }>("/api/bowbazar/slots", { method: "POST", json: { seedDefaults: true } });
      toast.success(`${data.created} slots created.`);
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Slots"
        subtitle={loading ? "Loading..." : `${open.length} open slots · ${free} free seats`}
        can={can}
        actions={
          canEdit && (
            <button type="button" className="btn-primary h-10" onClick={() => setEditing({ dayOfWeek: 6, startTime: "10:00", endTime: "11:00", mode: "offline", capacity: 7, isActive: true })}>
              <Plus size={16} /> Add slot
            </button>
          )
        }
      />

      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={onlyFree} onChange={(event) => setOnlyFree(event.target.checked)} />
        Only slots with a free seat
      </label>

      {!loading && !slots.length && (
        <div className="rounded-lg border border-dashed border-brand/30 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">No slots yet.</p>
          {canEdit && (
            <button type="button" className="btn-primary mt-3 h-10" onClick={seed} disabled={seeding}>
              {seeding ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Create the centre&apos;s timetable
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {days.map(({ day, slots: daySlots }) => (
          <section key={day} className="rounded-lg border border-brand/10 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">{DAY_NAMES[day]}</h2>
            <div className="space-y-2">
              {daySlots.map((slot) => (
                <article key={slot.id} className={cn("rounded-lg border p-3", fullness(slot))}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-black text-slate-950">{slot.label.slice(4)}</span>
                        <ModeBadge mode={slot.mode} />
                        {!slot.isActive && <span className="text-xs font-bold text-slate-500">Closed</span>}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-700">
                        {slot.filled}/{slot.capacity} seated ·{" "}
                        <span className={slot.free ? "text-emerald-700" : "text-red-700"}>{slot.free ? `${slot.free} free` : "Full"}</span>
                      </div>
                    </div>
                    {canEdit && (
                      <button type="button" onClick={() => setEditing(slot)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label={`Edit ${slot.label}`}>
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white">
                    <div className={cn("h-full", slot.free ? "bg-emerald-500" : "bg-red-500")} style={{ width: `${Math.min(100, (slot.filled / slot.capacity) * 100)}%` }} />
                  </div>
                  {slot.students.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {slot.students.map((student) => (
                        <span key={student.id} className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {student.name}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {editing && <SlotDrawer slot={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function SlotDrawer({ slot, onClose, onSaved }: { slot: Partial<Slot>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...slot });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Slot>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      await api(slot.id ? `/api/bowbazar/slots/${slot.id}` : "/api/bowbazar/slots", { method: slot.id ? "PATCH" : "POST", json: form });
      toast.success("Slot saved.");
      onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={slot.id ? `Edit ${slot.label}` : "New slot"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" onClick={save} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} Save
          </button>
        </>
      }
    >
      <Field label="Day">
        <select className="input" value={form.dayOfWeek} onChange={(event) => set({ dayOfWeek: Number(event.target.value) })}>
          {WEEK_ORDER.map((day) => <option key={day} value={day}>{DAY_NAMES[day]}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <input type="time" className="input" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} />
        </Field>
        <Field label="Ends">
          <input type="time" className="input" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Class type">
          <select className="input" value={form.mode} onChange={(event) => set({ mode: event.target.value as Slot["mode"] })}>
            <option value="offline">Offline (at the centre)</option>
            <option value="online">Online</option>
          </select>
        </Field>
        <Field label="Seats" hint="Bowbazar slots hold 7.">
          <input type="number" min={1} max={50} className="input" value={form.capacity} onChange={(event) => set({ capacity: Number(event.target.value) })} />
        </Field>
      </div>
      {form.mode === "online" && (
        <Field label="Meeting link" hint="Shown to the students in this slot.">
          <input className="input" value={form.meetingUrl || ""} onChange={(event) => set({ meetingUrl: event.target.value })} placeholder="https://meet.google.com/..." />
        </Field>
      )}
      {slot.id && (
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.isActive !== false} onChange={(event) => set({ isActive: event.target.checked })} />
          Slot is open
        </label>
      )}
    </Drawer>
  );
}
