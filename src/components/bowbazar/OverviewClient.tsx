"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { monthLabel } from "@/lib/branch/rules";
import { BranchHeader, CredentialsNote, Drawer, Field, Stat, api, rupees } from "./shared";

type Overview = {
  admissionsToReview: number;
  activeStudents: number;
  inactiveStudents: number;
  slots: number;
  seats: number;
  freeSeats: number;
  fullSlots: number;
  month: string;
  totals: { billed: number; collected: number; pending: number; pendingCount: number } | null;
};
type Staff = { id: string; name: string; email: string; phone: string; username: string; branchRole: string; isActive: boolean; lastLoginAt: string | null };

export default function OverviewClient({ can }: { can: string[] }) {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/api/bowbazar/overview").then(setOverview).catch((error) => toast.error(error.message));
  }, []);

  return (
    <div className="space-y-4">
      <BranchHeader title="Overview" subtitle="Offline centre: students, slots and fees, separate from the online academy." can={can} />
      {!overview && <div className="text-sm text-slate-500">Loading...</div>}
      {overview && (
        <>
          {overview.admissionsToReview > 0 && can.includes("students") && (
            <Link
              href="/bowbazar/admissions"
              className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900 hover:bg-sky-100"
            >
              <span>
                {overview.admissionsToReview} admission form{overview.admissionsToReview === 1 ? "" : "s"} filled in and waiting for review
              </span>
              <span className="shrink-0 underline">Review</span>
            </Link>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Active students" value={overview.activeStudents} hint={`${overview.inactiveStudents} inactive`} />
            <Stat label="Free seats" value={overview.freeSeats} tone={overview.freeSeats ? "good" : "warn"} hint={`of ${overview.seats} across ${overview.slots} slots`} />
            <Stat label="Full slots" value={overview.fullSlots} tone={overview.fullSlots ? "warn" : "default"} />
            {overview.totals && (
              <Stat
                label={`Pending · ${monthLabel(overview.month)}`}
                value={rupees(overview.totals.pending)}
                tone={overview.totals.pending ? "bad" : "good"}
                hint={`${rupees(overview.totals.collected)} of ${rupees(overview.totals.billed)} collected`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/bowbazar/slots" className="btn-outline h-10">See free seats</Link>
            {can.includes("students") && <Link href="/bowbazar/students" className="btn-outline h-10">Add a student</Link>}
            {can.includes("fees") && <Link href="/bowbazar/fees" className="btn-outline h-10">Who owes fees</Link>}
          </div>
        </>
      )}
      {can.includes("staff") && <StaffSection />}
    </div>
  );
}

function StaffSection() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);

  const load = useCallback(() => {
    api<{ staff: Staff[] }>("/api/bowbazar/staff").then((data) => setStaff(data.staff)).catch((error) => toast.error(error.message));
  }, []);
  useEffect(() => load(), [load]);

  async function toggle(member: Staff) {
    try {
      await api(`/api/bowbazar/staff/${member.id}`, { method: "PATCH", json: { isActive: !member.isActive } });
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-black text-slate-950">Branch staff</h2>
          <p className="text-xs text-slate-500">Logins that only open the Bowbazar portal and tournaments. Managers handle students and fees; coaches can view.</p>
        </div>
        <button type="button" className="btn-primary h-9" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add
        </button>
      </div>
      {created && (
        <div className="p-4">
          <div className="mb-1 text-sm font-bold">{created.name}</div>
          <CredentialsNote username={created.username} password={created.password} />
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {!staff.length && <div className="p-5 text-sm text-slate-500">No branch staff yet.</div>}
        {staff.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div>
              <div className="font-bold text-slate-950">
                {member.name} <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs capitalize text-brand">{member.branchRole}</span>
                {!member.isActive && <span className="ml-1 text-xs text-slate-500">Inactive</span>}
              </div>
              <div className="text-xs text-slate-500">{[member.username, member.email, member.phone].filter(Boolean).join(" · ")}</div>
            </div>
            <button type="button" className="btn-outline h-8 px-3 text-xs" onClick={() => toggle(member)}>
              {member.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ))}
      </div>
      {adding && (
        <StaffDrawer
          onClose={() => setAdding(false)}
          onCreated={(result) => {
            setAdding(false);
            setCreated(result);
            load();
          }}
        />
      )}
    </section>
  );
}

function StaffDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (result: { name: string; username: string; password: string }) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", branchRole: "coach" });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ username: string; password: string }>("/api/bowbazar/staff", { method: "POST", json: form });
      onCreated({ name: form.name, ...data });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title="Add branch staff"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" onClick={save} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} Create login
          </button>
        </>
      }
    >
      <Field label="Name"><input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} /></Field>
      <Field label="Email"><input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} /></Field>
      <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => set({ phone: event.target.value })} /></Field>
      <Field label="Role">
        <select className="input" value={form.branchRole} onChange={(event) => set({ branchRole: event.target.value })}>
          <option value="manager">Branch manager: students, slots, fees</option>
          <option value="coach">Coach: view students and slots</option>
        </select>
      </Field>
    </Drawer>
  );
}
