"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, History, KeyRound, Loader2, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { monthLabel } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { BranchHeader, CredentialsNote, Drawer, Field, ModeBadge, SlotPicker, api, rupees } from "./shared";
import type { Slot } from "./SlotsClient";
import { ClassLogList, HomeworkLogList, type ClassLogEntry, type ClassLogHomework } from "./ClassLog";

type Student = {
  id: string;
  name: string;
  regNo: string;
  username: string;
  status: "active" | "inactive";
  inactiveSince: string | null;
  inactiveReason: string;
  phone: string;
  email: string;
  parentName: string;
  fatherName: string;
  motherName: string;
  address: string;
  school: string;
  dateOfBirth: string | null;
  notes: string;
  monthlyFee: number;
  feeStartMonth: string;
  admissionDate: string;
  lastLoginAt: string | null;
  slots: { id: string; label: string; mode: string }[];
  pendingAmount: number;
  pendingMonths: string[];
  admissionId: string;
};

type Credentials = { username: string; password: string; note?: string };

export default function StudentsClient({ can }: { can: string[] }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [seesFees, setSeesFees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [slotFilter, setSlotFilter] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [editing, setEditing] = useState<Partial<Student> | null>(null);
  const [leaving, setLeaving] = useState<Student | null>(null);
  const [history, setHistory] = useState<Student | null>(null);
  const [credentials, setCredentials] = useState<(Credentials & { name: string }) | null>(null);

  const load = useCallback(async () => {
    try {
      const [studentData, slotData] = await Promise.all([
        api<{ students: Student[]; canEdit: boolean; seesFees: boolean }>("/api/bowbazar/students"),
        api<{ slots: Slot[] }>("/api/bowbazar/slots"),
      ]);
      setStudents(studentData.students);
      setCanEdit(studentData.canEdit);
      setSeesFees(studentData.seesFees);
      setSlots(slotData.slots);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((student) => {
      if (status !== "all" && student.status !== status) return false;
      if (slotFilter && !student.slots.some((slot) => slot.id === slotFilter)) return false;
      if (onlyPending && !student.pendingAmount) return false;
      if (!q) return true;
      return [student.name, student.regNo, student.username, student.phone, student.parentName, student.fatherName, student.motherName, student.school]
        .some((value) => value?.toLowerCase().includes(q));
    });
  }, [students, query, status, slotFilter, onlyPending]);

  const counts = {
    active: students.filter((student) => student.status === "active").length,
    inactive: students.filter((student) => student.status === "inactive").length,
  };

  async function reactivate(student: Student) {
    try {
      await api(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: { action: "status", status: "active" } });
      toast.success(`${student.name} is active again. Billing restarts this month.`);
      void load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function resetPassword(student: Student) {
    if (!window.confirm(`Give ${student.name} a new password? The old one stops working.`)) return;
    try {
      const data = await api<Credentials>(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: { action: "resetPassword" } });
      setCredentials({ ...data, name: student.name });
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Students"
        subtitle={loading ? "Loading..." : `${counts.active} active · ${counts.inactive} inactive`}
        can={can}
        actions={
          canEdit && (
            <>
              {seesFees && (
                <Link href="/bowbazar/import" className="btn-outline h-10">
                  <FileSpreadsheet size={16} /> Import from Excel
                </Link>
              )}
              <button type="button" className="btn-primary h-10" onClick={() => setEditing({ slots: [], monthlyFee: 0 })}>
                <Plus size={16} /> Add student
              </button>
            </>
          )
        }
      />

      {credentials && (
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-700">{credentials.name}</div>
          <CredentialsNote {...credentials} />
          <button type="button" className="text-xs font-bold text-slate-500 underline" onClick={() => setCredentials(null)}>Done</button>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-brand/10 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search name, parent, phone, school" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="input lg:w-40" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <select className="input lg:w-52" value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}>
          <option value="">Every slot</option>
          {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
        </select>
        {seesFees && (
          <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} />
            Fees pending
          </label>
        )}
      </div>

      <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
        {loading && <div className="p-5 text-sm text-slate-500">Loading students...</div>}
        {!loading && !shown.length && <div className="p-8 text-center text-sm text-slate-500">No students match.</div>}
        <div className="divide-y divide-slate-100">
          {shown.map((student) => (
            <article key={student.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-black text-slate-950">{student.name}</span>
                  <span className="font-mono text-xs text-slate-500">{[student.regNo, student.username].filter(Boolean).join(" · ")}</span>
                  {student.status === "inactive" && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Inactive</span>}
                </div>
                <div className="text-sm text-slate-600">
                  {[student.parentName, student.phone, student.school].filter(Boolean).join(" · ") || "No contact details"}
                </div>
                <div className="flex flex-wrap gap-1">
                  {student.slots.map((slot) => (
                    <span key={slot.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand">
                      {slot.label} {slot.mode === "online" && <ModeBadge mode="online" />}
                    </span>
                  ))}
                  {!student.slots.length && <span className="text-xs font-semibold text-amber-700">No slot</span>}
                </div>
                {student.status === "inactive" && (
                  <div className="text-xs text-slate-500">
                    Left {student.inactiveSince ? new Date(student.inactiveSince).toLocaleDateString("en-IN") : ""} · {student.inactiveReason}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {seesFees && (
                  <div className="mr-2 text-right">
                    <div className="text-sm font-bold text-slate-700">{rupees(student.monthlyFee)}/month</div>
                    {student.pendingAmount > 0 ? (
                      <div className="text-xs font-bold text-red-700" title={student.pendingMonths.map(monthLabel).join(", ")}>
                        {rupees(student.pendingAmount)} pending ({student.pendingMonths.length} mo)
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-emerald-700">No dues</div>
                    )}
                  </div>
                )}
                <IconButton label="Classes and homework" onClick={() => setHistory(student)}><History size={15} /></IconButton>
                {canEdit && (
                  <>
                    <IconButton label="Edit" onClick={() => setEditing(student)}><Pencil size={15} /></IconButton>
                    <IconButton label="New password" onClick={() => resetPassword(student)}><KeyRound size={15} /></IconButton>
                    {student.status === "active" ? (
                      <IconButton label="Mark inactive" tone="bad" onClick={() => setLeaving(student)}><UserX size={15} /></IconButton>
                    ) : (
                      <IconButton label="Reactivate" tone="good" onClick={() => reactivate(student)}><UserCheck size={15} /></IconButton>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {editing && (
        <StudentDrawer
          student={editing}
          slots={slots}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            if (created) setCredentials(created);
            void load();
          }}
        />
      )}
      {leaving && <LeaveDrawer student={leaving} onClose={() => setLeaving(null)} onDone={() => { setLeaving(null); void load(); }} />}
      {history && <HistoryDrawer student={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

type StudentHistory = {
  classes: ClassLogEntry[];
  homework: ClassLogHomework[];
  summary: { attended: number; marked: number; absent: number };
  lastMonth: { attended: number; marked: number };
};

function HistoryDrawer({ student, onClose }: { student: Student; onClose: () => void }) {
  const [data, setData] = useState<StudentHistory | null>(null);
  useEffect(() => {
    api<StudentHistory>(`/api/bowbazar/students/${student.id}/history`)
      .then(setData)
      .catch((error) => toast.error(error.message));
  }, [student.id]);
  return (
    <Drawer title={student.name} onClose={onClose}>
      {!data ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-bold uppercase text-slate-500">Last 30 days</div>
              <div className="text-lg font-black text-slate-950">{data.lastMonth.attended}/{data.lastMonth.marked} classes</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-bold uppercase text-slate-500">All recorded</div>
              <div className="text-lg font-black text-slate-950">{data.summary.attended}/{data.summary.marked} classes</div>
            </div>
          </div>
          <section>
            <h3 className="mb-1 text-sm font-black text-slate-950">Portal homework</h3>
            <HomeworkLogList homework={data.homework} linkTo={(id) => `/homework/${id}/review`} />
          </section>
          <section>
            <h3 className="mb-1 text-sm font-black text-slate-950">Classes</h3>
            <ClassLogList classes={data.classes} />
          </section>
        </>
      )}
    </Drawer>
  );
}

function IconButton({ label, onClick, children, tone }: { label: string; onClick: () => void; children: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border",
        tone === "bad" ? "border-red-200 text-red-700 hover:bg-red-50" : tone === "good" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function StudentDrawer({
  student,
  slots,
  onClose,
  onSaved,
}: {
  student: Partial<Student>;
  slots: Slot[];
  onClose: () => void;
  onSaved: (created?: Credentials & { name: string }) => void;
}) {
  const isNew = !student.id;
  const [form, setForm] = useState({
    name: student.name || "",
    phone: student.phone || "",
    email: student.email || "",
    fatherName: student.fatherName || "",
    motherName: student.motherName || "",
    address: student.address || "",
    school: student.school || "",
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
    monthlyFee: student.monthlyFee ? String(student.monthlyFee / 100) : "",
    notes: student.notes || "",
    slots: (student.slots || []).map((slot) => slot.id),
    sendLogin: true,
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      if (isNew) {
        const data = await api<{ username: string; password: string; welcomeSent: boolean }>("/api/bowbazar/students", { method: "POST", json: form });
        toast.success(`${form.name} added.`);
        onSaved({
          name: form.name,
          username: data.username,
          password: data.password,
          note: form.sendLogin ? (data.welcomeSent ? "Also sent to the family by email and WhatsApp." : "Sending to the family did not go through - share these by hand.") : undefined,
        });
      } else {
        await api(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: form });
        toast.success("Saved.");
        onSaved();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={isNew ? "Add student" : `Edit ${student.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" onClick={save} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} {isNew ? "Add student" : "Save"}
          </button>
        </>
      }
    >
      <Field label="Student's name *">
        <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Father's name">
          <input className="input" value={form.fatherName} onChange={(event) => set({ fatherName: event.target.value })} />
        </Field>
        <Field label="Mother's name">
          <input className="input" value={form.motherName} onChange={(event) => set({ motherName: event.target.value })} />
        </Field>
        <Field label="Parent's phone *" hint="WhatsApp number">
          <input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} />
        </Field>
        <Field label="School">
          <input className="input" value={form.school} onChange={(event) => set({ school: event.target.value })} />
        </Field>
        <Field label="Date of birth">
          <input className="input" type="date" value={form.dateOfBirth} onChange={(event) => set({ dateOfBirth: event.target.value })} />
        </Field>
      </div>
      <Field label="Address">
        <textarea className="input min-h-[64px]" value={form.address} onChange={(event) => set({ address: event.target.value })} />
      </Field>
      <Field label="Monthly fee (₹)" hint="This student's own amount; no GST.">
        <input className="input" inputMode="decimal" value={form.monthlyFee} onChange={(event) => set({ monthlyFee: event.target.value })} />
      </Field>
      <SlotPicker slots={slots} value={form.slots} onChange={(value) => set({ slots: value })} seatedIn={(student.slots || []).map((slot) => slot.id)} />
      <Field label="Notes">
        <textarea className="input min-h-[64px]" value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
      </Field>
      {student.admissionId && (
        <div className="flex flex-wrap gap-3 text-sm font-bold">
          <a className="text-brand hover:underline" href={`/api/bowbazar/admissions/${student.admissionId}/file?kind=photo`} target="_blank" rel="noreferrer">Admission photo</a>
          <a className="text-brand hover:underline" href={`/api/bowbazar/admissions/${student.admissionId}/file?kind=idDocument`} target="_blank" rel="noreferrer">Identity document</a>
        </div>
      )}
      {isNew && (
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.sendLogin} onChange={(event) => set({ sendLogin: event.target.checked })} />
          Send the login details to the family (email + WhatsApp)
        </label>
      )}
    </Drawer>
  );
}

function LeaveDrawer({ student, onClose, onDone }: { student: Student; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [since, setSince] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: { action: "status", status: "inactive", reason, since } });
      toast.success(`${student.name} marked inactive. Their seat is free.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={`Mark ${student.name} inactive`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10 bg-red-700 hover:bg-red-800" onClick={save} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} Mark inactive
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Their seat in {student.slots.map((slot) => slot.label).join(", ") || "their slot"} frees up, no new monthly bills are raised, and their login loses homework and tournaments. Bills already raised stay on record.
      </p>
      <Field label="Left on">
        <input type="date" className="input" value={since} onChange={(event) => setSince(event.target.value)} />
      </Field>
      <Field label="Reason *">
        <textarea className="input min-h-[80px]" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. exams, moved away, fees" />
      </Field>
    </Drawer>
  );
}
