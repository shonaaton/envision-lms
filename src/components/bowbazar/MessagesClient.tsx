"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarX, Copy, Loader2, Megaphone, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DAY_NAMES } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { BranchHeader, Drawer, Field, api } from "./shared";

type SlotLite = { id: string; label: string; dayOfWeek: number; isActive: boolean };
type StudentLite = { id: string; name: string; status: string; username: string };
type Announcement = { id: string; title: string; message: string; kind: string; audienceLabel: string; recipients: number; emailed: number; createdAt: string; createdByName: string };
type Holiday = { id: string; date: string; reason: string; classes: string[]; past: boolean; createdByName: string };
type PopupRow = { id: string; title: string; body: string; ctaLabel: string; ctaHref: string; audience: string; targetIds: string[]; targetLabel: string; startsAt: string; endsAt: string | null; priority: string; status: string };
type NoticeRow = { id: string; title: string; message: string; type: string; read: boolean; createdAt: string; to: string; toRole: string };

const TABS = [
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "holidays", label: "Holidays", icon: CalendarX },
  { key: "popups", label: "Pop-ups", icon: Sparkles },
  { key: "notifications", label: "Notifications", icon: Bell },
] as const;

const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const dayText = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Pick everyone, some classes, or chosen students. */
function AudiencePicker({
  slots,
  students,
  value,
  onChange,
  allowStudents = true,
}: {
  slots: SlotLite[];
  students: StudentLite[];
  value: { audience: string; slotIds: string[]; studentIds: string[] };
  onChange: (value: { audience: string; slotIds: string[]; studentIds: string[] }) => void;
  allowStudents?: boolean;
}) {
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {[["all", "Everyone"], ["slots", "Some classes"], ...(allowStudents ? [["students", "Chosen students"]] : [])].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ ...value, audience: key })}
            className={cn("rounded-md border px-3 py-1.5 text-sm font-bold", value.audience === key ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600")}
          >
            {label}
          </button>
        ))}
      </div>
      {value.audience === "slots" && (
        <div className="flex flex-wrap gap-1">
          {slots.filter((slot) => slot.isActive).map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => onChange({ ...value, slotIds: toggle(value.slotIds, slot.id) })}
              className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", value.slotIds.includes(slot.id) ? "border-brand bg-brand-50 text-brand" : "border-slate-200 text-slate-600")}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}
      {value.audience === "students" && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100">
          {students.filter((student) => student.status === "active").map((student) => (
            <label key={student.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-sm">
              <input type="checkbox" checked={value.studentIds.includes(student.id)} onChange={() => onChange({ ...value, studentIds: toggle(value.studentIds, student.id) })} />
              {student.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MessagesClient({ can }: { can: string[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("announcements");
  const [slots, setSlots] = useState<SlotLite[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);

  useEffect(() => {
    Promise.all([api<{ slots: SlotLite[] }>("/api/bowbazar/slots"), api<{ students: StudentLite[] }>("/api/bowbazar/students")])
      .then(([slotData, studentData]) => {
        setSlots(slotData.slots);
        setStudents(studentData.students);
      })
      .catch((error) => toast.error(error.message));
  }, []);

  return (
    <div className="space-y-4">
      <BranchHeader title="Messages" subtitle="Tell Bowbazar families about news and closures. Nothing here reaches the online academy." can={can} />
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5", tab === entry.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            <entry.icon size={15} /> {entry.label}
          </button>
        ))}
      </div>
      {tab === "announcements" && <Announcements slots={slots} students={students} />}
      {tab === "holidays" && <Holidays slots={slots} />}
      {tab === "popups" && <Popups slots={slots} students={students} />}
      {tab === "notifications" && <Notices />}
    </div>
  );
}

function Announcements({ slots, students }: { slots: SlotLite[]; students: StudentLite[] }) {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [sent, setSent] = useState<{ recipients: number; emailed: number; whatsappText: string } | null>(null);
  const load = useCallback(() => {
    api<{ announcements: Announcement[] }>("/api/bowbazar/announcements").then((data) => setRows(data.announcements)).catch((error) => toast.error(error.message));
  }, []);
  useEffect(load, [load]);

  async function archive(row: Announcement) {
    if (!window.confirm(`Take "${row.title}" off families' pages?`)) return;
    try {
      await api(`/api/bowbazar/announcements/${row.id}`, { method: "DELETE" });
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        <button type="button" className="btn-primary h-10" onClick={() => setWriting(true)}>
          <Plus size={16} /> New announcement
        </button>
      </div>
      {sent && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-bold">Sent to {sent.recipients} families{sent.emailed ? ` (${sent.emailed} by email too)` : ""}. They see it on their portal page.</div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-bold underline"
            onClick={() => {
              void navigator.clipboard?.writeText(sent.whatsappText);
              toast.success("Copied. Paste it into the class WhatsApp group.");
            }}
          >
            <Copy size={12} /> Copy for the WhatsApp group
          </button>
        </div>
      )}
      <div className="divide-y divide-slate-100 rounded-lg border border-brand/10 bg-white shadow-sm">
        {!rows ? (
          <div className="p-5 text-sm text-slate-500">Loading...</div>
        ) : !rows.length ? (
          <div className="p-8 text-center text-sm text-slate-500">No announcements yet.</div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-slate-950">{row.title}</span>
                  {row.kind === "holiday" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Holiday</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.message}</p>
                <div className="mt-1 text-xs text-slate-500">
                  {row.audienceLabel} · {row.recipients} reached{row.emailed ? ` · ${row.emailed} emailed` : ""} · {when(row.createdAt)} by {row.createdByName || "staff"}
                </div>
              </div>
              <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => void archive(row)} aria-label="Take off families' pages">
                <Trash2 size={15} />
              </button>
            </article>
          ))
        )}
      </div>
      {writing && (
        <AnnouncementDrawer
          slots={slots}
          students={students}
          onClose={() => setWriting(false)}
          onSent={(result) => {
            setWriting(false);
            setSent(result);
            load();
          }}
        />
      )}
    </section>
  );
}

function AnnouncementDrawer({ slots, students, onClose, onSent }: { slots: SlotLite[]; students: StudentLite[]; onClose: () => void; onSent: (result: { recipients: number; emailed: number; whatsappText: string }) => void }) {
  const [form, setForm] = useState({ title: "", message: "" });
  const [audience, setAudience] = useState({ audience: "all", slotIds: [] as string[], studentIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  async function send() {
    setSaving(true);
    try {
      onSent(await api("/api/bowbazar/announcements", { method: "POST", json: { ...form, ...audience } }));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Drawer
      title="New announcement"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void send()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Send
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">Families see it on their portal page and as a notification; those with an email get it by email too.</p>
      <Field label="Title *">
        <input className="input" maxLength={140} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      </Field>
      <Field label="Message *">
        <textarea className="input min-h-[140px]" maxLength={2000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
      </Field>
      <div className="space-y-1">
        <div className="text-xs font-bold text-slate-600">Who gets it</div>
        <AudiencePicker slots={slots} students={students} value={audience} onChange={setAudience} />
      </div>
    </Drawer>
  );
}

function Holidays({ slots }: { slots: SlotLite[] }) {
  const [rows, setRows] = useState<Holiday[] | null>(null);
  const [form, setForm] = useState({ date: "", reason: "", slotIds: [] as string[], notify: true });
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    api<{ holidays: Holiday[] }>("/api/bowbazar/holidays").then((data) => setRows(data.holidays)).catch((error) => toast.error(error.message));
  }, []);
  useEffect(load, [load]);
  const day = form.date ? new Date(`${form.date}T00:00:00Z`).getUTCDay() : -1;
  const daySlots = slots.filter((slot) => slot.isActive && slot.dayOfWeek === day);

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ notified: number }>("/api/bowbazar/holidays", { method: "POST", json: form });
      toast.success(form.notify ? `Holiday added. ${data.notified} families told.` : "Holiday added.");
      setForm({ date: "", reason: "", slotIds: [], notify: true });
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(row: Holiday) {
    if (!window.confirm(`Cancel the holiday on ${dayText(row.date)}? Classes will run that day. Families are not told automatically.`)) return;
    try {
      await api(`/api/bowbazar/holidays/${row.id}`, { method: "DELETE" });
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="space-y-3 rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <h2 className="text-base font-black text-slate-950">Close the centre</h2>
        <Field label="Date">
          <input type="date" className="input" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, slotIds: [] })} />
        </Field>
        {form.date && (
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-600">
              {daySlots.length ? `Classes on ${DAY_NAMES[day]}: leave all unticked to close the whole day` : `No classes meet on ${DAY_NAMES[day]}s.`}
            </div>
            <div className="flex flex-wrap gap-1">
              {daySlots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setForm({ ...form, slotIds: form.slotIds.includes(slot.id) ? form.slotIds.filter((id) => id !== slot.id) : [...form.slotIds, slot.id] })}
                  className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", form.slotIds.includes(slot.id) ? "border-brand bg-brand-50 text-brand" : "border-slate-200 text-slate-600")}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Why">
          <input className="input" value={form.reason} placeholder="e.g. Durga Puja" onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.notify} onChange={(event) => setForm({ ...form, notify: event.target.checked })} />
          Tell the families of those classes
        </label>
        <button type="button" className="btn-primary h-10 w-full" disabled={saving || !form.date || !form.reason.trim() || !daySlots.length} onClick={() => void save()}>
          {saving && <Loader2 size={16} className="animate-spin" />} Add holiday
        </button>
      </section>
      <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-4 py-3 text-base font-black text-slate-950">Coming up</h2>
        {!rows ? (
          <div className="p-5 text-sm text-slate-500">Loading...</div>
        ) : !rows.length ? (
          <div className="p-6 text-center text-sm text-slate-500">No holidays planned.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className={cn("flex items-center justify-between gap-2 px-4 py-3 text-sm", row.past && "opacity-60")}>
                <span>
                  <span className="font-bold text-slate-900">{dayText(row.date)}</span> · {row.reason}
                  <span className="block text-xs text-slate-500">{row.classes.length ? row.classes.join(", ") : "Whole centre"}</span>
                </span>
                {!row.past && (
                  <button type="button" className="text-xs font-bold text-red-700 hover:underline" onClick={() => void cancel(row)}>
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Popups({ slots, students }: { slots: SlotLite[]; students: StudentLite[] }) {
  const [rows, setRows] = useState<PopupRow[] | null>(null);
  const [editing, setEditing] = useState<Partial<PopupRow> | null>(null);
  const load = useCallback(() => {
    api<{ popups: PopupRow[] }>("/api/bowbazar/popups").then((data) => setRows(data.popups)).catch((error) => toast.error(error.message));
  }, []);
  useEffect(load, [load]);

  async function setStatus(row: PopupRow, status: string) {
    try {
      await api(`/api/bowbazar/popups/${row.id}`, { method: "PATCH", json: { status } });
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">A pop-up shows when a Bowbazar student opens the portal, until they close it.</p>
        <button type="button" className="btn-primary h-10" onClick={() => setEditing({ audience: "branch_all", priority: "normal" })}>
          <Plus size={16} /> New pop-up
        </button>
      </div>
      <div className="divide-y divide-slate-100 rounded-lg border border-brand/10 bg-white shadow-sm">
        {!rows ? (
          <div className="p-5 text-sm text-slate-500">Loading...</div>
        ) : !rows.length ? (
          <div className="p-8 text-center text-sm text-slate-500">No pop-ups yet.</div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-slate-950">{row.title}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", row.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700")}>
                    {row.status === "active" ? "Showing" : row.status === "archived" ? "Stopped" : "Draft"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{row.body}</p>
                <div className="mt-1 text-xs text-slate-500">
                  {row.targetLabel || (row.audience === "branch_all" ? "All Bowbazar students" : row.audience)}
                  {row.endsAt ? ` · until ${new Date(row.endsAt).toLocaleDateString("en-IN")}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-outline h-8 px-2 text-xs" onClick={() => setEditing(row)}>Edit</button>
                <button type="button" className="btn-outline h-8 px-2 text-xs" onClick={() => void setStatus(row, row.status === "active" ? "archived" : "active")}>
                  {row.status === "active" ? "Stop" : "Show again"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      {editing && <PopupDrawer popup={editing} slots={slots} students={students} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </section>
  );
}

function PopupDrawer({ popup, slots, students, onClose, onSaved }: { popup: Partial<PopupRow>; slots: SlotLite[]; students: StudentLite[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: popup.title || "",
    body: popup.body || "",
    ctaLabel: popup.ctaLabel || "",
    ctaHref: popup.ctaHref || "",
    endsAt: popup.endsAt ? popup.endsAt.slice(0, 10) : "",
    priority: popup.priority || "normal",
  });
  const [audience, setAudience] = useState({
    audience: popup.audience === "branch_slot" ? "slots" : popup.audience === "student" ? "students" : "all",
    slotIds: popup.audience === "branch_slot" ? popup.targetIds || [] : [],
    studentIds: popup.audience === "student" ? popup.targetIds || [] : [],
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const mapped = audience.audience === "slots" ? "branch_slot" : audience.audience === "students" ? "student" : "branch_all";
      const targetIds = mapped === "branch_slot" ? audience.slotIds : mapped === "student" ? audience.studentIds : [];
      const targetLabel =
        mapped === "branch_slot"
          ? slots.filter((slot) => targetIds.includes(slot.id)).map((slot) => slot.label).join(", ")
          : mapped === "student"
            ? `${targetIds.length} chosen students`
            : "All Bowbazar students";
      const body = { ...form, endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:00+05:30`).toISOString() : null, audience: mapped, targetIds, targetLabel, ...(popup.id ? {} : { startsAt: new Date().toISOString(), status: "active" }) };
      if (popup.id) await api(`/api/bowbazar/popups/${popup.id}`, { method: "PATCH", json: body });
      else await api("/api/bowbazar/popups", { method: "POST", json: body });
      toast.success("Saved.");
      onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  // Pop-ups take user logins, so chosen students are the accounts behind the branch records.
  const studentUsers = students.map((student) => ({ ...student, id: (student as any).userId || student.id }));
  return (
    <Drawer
      title={popup.id ? "Edit pop-up" : "New pop-up"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Save
          </button>
        </>
      }
    >
      <Field label="Title *">
        <input className="input" maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      </Field>
      <Field label="Message *">
        <textarea className="input min-h-[100px]" maxLength={1200} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Button text" hint="Optional">
          <input className="input" maxLength={40} value={form.ctaLabel} onChange={(event) => setForm({ ...form, ctaLabel: event.target.value })} />
        </Field>
        <Field label="Button link" hint="A portal page like /tournaments, or https://">
          <input className="input" value={form.ctaHref} onChange={(event) => setForm({ ...form, ctaHref: event.target.value })} />
        </Field>
        <Field label="Show until" hint="Leave empty to keep showing">
          <input type="date" className="input" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
        </Field>
        <Field label="Importance">
          <select className="input" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            <option value="normal">Normal</option>
            <option value="high">High: shown before anything else</option>
          </select>
        </Field>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-bold text-slate-600">Who sees it</div>
        <AudiencePicker slots={slots} students={studentUsers} value={audience} onChange={setAudience} />
      </div>
    </Drawer>
  );
}

function Notices() {
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<NoticeRow[] | null>(null);
  useEffect(() => {
    setRows(null);
    api<{ notifications: NoticeRow[] }>(`/api/bowbazar/notifications?kind=${kind}`).then((data) => setRows(data.notifications)).catch((error) => toast.error(error.message));
  }, [kind]);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Every portal notice Bowbazar accounts got lately: reminders, receipts, homework, alerts.</p>
        <select className="input h-9 w-auto" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">Everyone</option>
          <option value="students">Students</option>
          <option value="staff">Staff</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
        {!rows ? (
          <div className="p-5 text-sm text-slate-500">Loading...</div>
        ) : !rows.length ? (
          <div className="p-8 text-center text-sm text-slate-500">No notifications yet.</div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">To</th><th className="px-4 py-2">Notice</th><th className="px-4 py-2">Read</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{when(row.createdAt)}</td>
                  <td className="px-4 py-2"><span className="font-semibold">{row.to}</span> <span className="text-xs text-slate-400">{row.toRole}</span></td>
                  <td className="px-4 py-2"><div className="font-semibold text-slate-900">{row.title}</div><div className="line-clamp-2 text-xs text-slate-500">{row.message}</div></td>
                  <td className="px-4 py-2 text-xs">{row.read ? "Read" : <span className="font-bold text-amber-700">Unread</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
