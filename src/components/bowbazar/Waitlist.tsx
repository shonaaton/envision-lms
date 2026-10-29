"use client";

import { useState } from "react";
import { Check, Hourglass, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Drawer, Field, api } from "./shared";

type SlotLite = { id: string; label: string; isActive: boolean; free: number };
export type WaitlistEntry = { id: string; slotId: string; name: string; phone: string; note: string; createdAt: string; createdByName: string };

/** Who is waiting for which slot, oldest first; slots with a free seat come first. */
export function WaitlistPanel({
  slots,
  waitlist,
  canEdit,
  onAdd,
  onChange,
}: {
  slots: SlotLite[];
  waitlist: WaitlistEntry[];
  canEdit: boolean;
  onAdd: () => void;
  onChange: (list: WaitlistEntry[]) => void;
}) {
  const groups = slots
    .map((slot) => ({ slot, entries: waitlist.filter((entry) => entry.slotId === slot.id) }))
    .filter((group) => group.entries.length)
    .sort((a, b) => Number(b.slot.free > 0) - Number(a.slot.free > 0));

  async function close(entry: WaitlistEntry, status: "placed" | "removed") {
    try {
      const data = await api<{ waitlist: WaitlistEntry[] }>(`/api/bowbazar/waitlist/${entry.id}`, { method: "PATCH", json: { status } });
      onChange(data.waitlist);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
            <Hourglass size={16} className="text-brand" /> Waitlist
          </h2>
          <p className="text-xs text-slate-500">Families waiting for a full slot. You and the manager are notified when a seat frees up.</p>
        </div>
        {canEdit && (
          <button type="button" className="btn-outline h-9 px-3 text-sm" onClick={onAdd}>
            <Plus size={15} /> Add to waitlist
          </button>
        )}
      </div>
      {!groups.length ? (
        <p className="mt-3 text-sm text-slate-500">Nobody is waiting.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {groups.map(({ slot, entries }) => (
            <div key={slot.id}>
              <div className="text-sm font-black text-slate-900">
                {slot.label}
                <span className={cn("ml-2 text-xs font-bold", slot.free ? "text-emerald-700" : "text-red-700")}>{slot.free ? `${slot.free} free now` : "Full"}</span>
              </div>
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-100">
                {entries.map((entry, index) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      <span className="mr-2 text-xs text-slate-400">{index + 1}.</span>
                      <span className="font-semibold text-slate-900">{entry.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {[entry.phone, entry.note, `since ${new Date(entry.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {canEdit && (
                      <span className="flex gap-1">
                        <button type="button" className="btn-outline h-8 px-2 text-xs" onClick={() => void close(entry, "placed")} title="They have a seat now">
                          <Check size={13} /> Placed
                        </button>
                        <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => void close(entry, "removed")} aria-label={`Remove ${entry.name}`}>
                          <X size={14} />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function WaitlistDrawer({ slots, onClose, onSaved }: { slots: SlotLite[]; onClose: () => void; onSaved: (list: WaitlistEntry[]) => void }) {
  const [form, setForm] = useState({ slotId: slots.find((slot) => slot.isActive && slot.free === 0)?.id || slots[0]?.id || "", name: "", phone: "", note: "" });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ waitlist: WaitlistEntry[] }>("/api/bowbazar/waitlist", { method: "POST", json: form });
      toast.success(`${form.name} added to the waitlist.`);
      onSaved(data.waitlist);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title="Add to waitlist"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Add
          </button>
        </>
      }
    >
      <Field label="Slot">
        <select className="input" value={form.slotId} onChange={(event) => set({ slotId: event.target.value })}>
          {slots
            .filter((slot) => slot.isActive)
            .map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label} ({slot.free ? `${slot.free} free` : "full"})
              </option>
            ))}
        </select>
      </Field>
      <Field label="Name *" hint="The child, or a current student who wants this slot">
        <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </Field>
      <Field label="Parent's phone">
        <input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
      </Field>
      <Field label="Note">
        <input className="input" value={form.note} onChange={(event) => set({ note: event.target.value })} />
      </Field>
    </Drawer>
  );
}
