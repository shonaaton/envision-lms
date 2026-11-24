"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarPlus, ClipboardCheck, Link2, Loader2, Pencil, Plus, Search, Trash2, Undo2, UserPlus, UserRound, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { DAY_NAMES, WEEK_ORDER, timeLabel } from "@/lib/branch/rules";
import { shortDate } from "@/lib/branch/classSessionRules";
import { cn } from "@/lib/utils";
import { Badge, BranchHeader, Drawer, Field, Modal, MoreMenu, api, useConfirm } from "./shared";

type Meeting = {
  date: string;
  kind: "regular" | "moved" | "extra";
  startTime: string;
  endTime: string;
  fromDate: string;
  cancelled: boolean;
  movedTo: { date: string; startTime: string } | null;
  reason: string;
  guests: { id: string; name: string }[];
};

type OnlineClass = {
  id: string;
  name: string;
  label: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  meetingUrl: string;
  isActive: boolean;
  coach: { id: string; name: string } | null;
  students: { id: string; name: string; regNo: string; hasLogin: boolean }[];
  meetsToday: boolean;
  todayTime: { startTime: string; endTime: string } | null;
  upcoming: Meeting[];
};

/** A change to one date, or deleting the class, waiting in its pop-up. */
type Action =
  | { kind: "cancel" | "reschedule" | "guests"; item: OnlineClass; meeting: Meeting }
  | { kind: "extra" | "delete"; item: OnlineClass };

type Told = { families: number; portal: number; email: number; whatsapp: number; coach: boolean } | null;

function toldLine(told: Told) {
  if (!told) return "";
  const parts = [`${told.families} famil${told.families === 1 ? "y" : "ies"}`, told.coach ? "the coach" : ""].filter(Boolean).join(" and ");
  return ` Told ${parts}: ${told.whatsapp} WhatsApp, ${told.email} email, ${told.portal} in the portal.`;
}

type Data = {
  today: string;
  classes: OnlineClass[];
  coaches: { id: string; name: string; role: string }[];
  students: { id: string; name: string; regNo: string; level: string }[];
  canEdit: boolean;
};

type Form = {
  id?: string;
  name: string;
  days: number[];
  startTime: string;
  endTime: string;
  capacity: number;
  coachId: string;
  meetingUrl: string;
  studentIds: string[];
  isActive: boolean;
};

const blankForm = (): Form => ({ name: "", days: [], startTime: "17:00", endTime: "18:00", capacity: 7, coachId: "", meetingUrl: "", studentIds: [], isActive: true });

export default function OnlineClassesClient({ can }: { can: string[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("/api/bowbazar/online"));
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = (data?.classes || []).filter((item) => item.isActive);
  const off = (data?.classes || []).filter((item) => !item.isActive);
  const today = active.filter((item) => item.meetsToday);

  /** Quick changes with nothing to fill in: restore, undo a move, take a student off. */
  async function quick(item: OnlineClass, body: Record<string, unknown>, title: string, message: string) {
    if (!(await confirm({ title, message, confirmLabel: "Yes" }))) return;
    try {
      const result = await api<{ told: Told }>(`/api/bowbazar/online/${item.id}/sessions`, { method: "POST", json: body });
      toast.success(`Done.${toldLine(result.told)}`);
      await load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }
  const cardProps = (item: OnlineClass) => ({
    item,
    canEdit: Boolean(data?.canEdit),
    onEdit: () => setForm(formFor(item)),
    onAction: setAction,
    onQuick: quick,
  });

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Online classes"
        subtitle={
          data
            ? `${active.length} online class${active.length === 1 ? "" : "es"} a week · ${today.length} today. Each runs in the academy's live room, and ending the class fills its register.`
            : "Loading..."
        }
        can={can}
        actions={
          data?.canEdit && (
            <button type="button" className="btn-primary h-10" onClick={() => setForm(blankForm())}>
              <Plus size={16} /> New online class
            </button>
          )
        }
      />

      {!data && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading classes...
        </div>
      )}

      {data && !data.classes.length && (
        <div className="rounded-lg border border-dashed border-brand/30 bg-white p-8 text-center text-sm text-slate-600">
          No online classes yet.
          {data.canEdit && " Make one with New online class: give it a name, its days and time, a coach and its students."}
        </div>
      )}

      {today.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Today</h2>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {today.map((item) => (
              <ClassCard key={item.id} {...cardProps(item)} />
            ))}
          </div>
        </section>
      )}

      {active.length > today.length && (
        <section className="space-y-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Every week</h2>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {active
              .filter((item) => !item.meetsToday)
              .map((item) => (
                <ClassCard key={item.id} {...cardProps(item)} />
              ))}
          </div>
        </section>
      )}

      {off.length > 0 && (
        <section className="space-y-2">
          <button type="button" className="text-sm font-bold text-slate-500 underline" onClick={() => setShowOff((value) => !value)}>
            {showOff ? "Hide" : "Show"} {off.length} switched-off class{off.length === 1 ? "" : "es"}
          </button>
          {showOff && (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {off.map((item) => (
                <ClassCard key={item.id} {...cardProps(item)} />
              ))}
            </div>
          )}
        </section>
      )}

      {action && data && (
        <ActionDialog
          action={action}
          students={data.students}
          onClose={() => setAction(null)}
          onDone={async () => {
            setAction(null);
            await load();
          }}
        />
      )}
      {confirmDialog}

      {form && data && (
        <ClassForm
          form={form}
          data={data}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function formFor(item: OnlineClass): Form {
  return {
    id: item.id,
    name: item.name,
    days: [item.dayOfWeek],
    startTime: item.startTime,
    endTime: item.endTime,
    capacity: item.capacity,
    coachId: item.coach?.id || "",
    meetingUrl: item.meetingUrl,
    studentIds: item.students.map((student) => student.id),
    isActive: item.isActive,
  };
}

type QuickChange = (item: OnlineClass, body: Record<string, unknown>, title: string, message: string) => Promise<void>;

function ClassCard({
  item,
  canEdit,
  onEdit,
  onAction,
  onQuick,
}: {
  item: OnlineClass;
  canEdit: boolean;
  onEdit: () => void;
  onAction: (action: Action) => void;
  onQuick: QuickChange;
}) {
  const [showAll, setShowAll] = useState(false);
  const time = item.label.includes(" · ") ? item.label.split(" · ").slice(1).join(" · ") : item.label;
  const todayTime = item.todayTime && (item.todayTime.startTime !== item.startTime || item.todayTime.endTime !== item.endTime) ? item.todayTime : null;
  const meetings = showAll ? item.upcoming : item.upcoming.slice(0, 4);
  return (
    <article className={cn("space-y-3 rounded-lg border bg-white p-4 shadow-sm", item.isActive ? "border-sky-200" : "border-slate-200 opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-black text-slate-950">{item.name || "Online class"}</h3>
          <p className="text-sm font-semibold text-sky-800">{time}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn-outline h-9 px-2.5 text-xs" onClick={onEdit}>
              <Pencil size={14} /> Edit
            </button>
            <MoreMenu
              label={`More for ${item.name || "this class"}`}
              items={[
                item.isActive && { label: "Add an extra class", icon: <CalendarPlus size={15} />, onClick: () => onAction({ kind: "extra", item }) },
                { label: "Delete this class", icon: <Trash2 size={15} />, danger: true, onClick: () => onAction({ kind: "delete", item }) },
              ]}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <UserRound size={14} /> {item.coach ? item.coach.name : "No coach set (whoever opens it teaches)"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={14} /> {item.students.length}/{item.capacity} students
        </span>
        {item.meetingUrl && (
          <a href={item.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand underline">
            <Link2 size={14} /> Meeting link
          </a>
        )}
      </div>
      {item.students.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.students.map((student) => (
            <span
              key={student.id}
              className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", student.hasLogin ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-900")}
              title={student.hasLogin ? student.regNo : "No login yet: can't join the live room"}
            >
              {student.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-800">No students every week yet.</p>
      )}

      {item.isActive && item.upcoming.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Coming up</div>
          <ul className="space-y-1.5">
            {meetings.map((meeting) => (
              <MeetingRow key={meeting.date} item={item} meeting={meeting} canEdit={canEdit} onAction={onAction} onQuick={onQuick} />
            ))}
          </ul>
          {item.upcoming.length > 4 && (
            <button type="button" className="text-xs font-bold text-slate-500 underline" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show fewer" : `Show all ${item.upcoming.length} in the next 5 weeks`}
            </button>
          )}
        </div>
      )}

      {item.isActive && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {item.meetsToday ? (
            <Link href={`/bowbazar/live/${item.id}`} className="btn-primary h-9 px-3 text-sm">
              <Video size={16} /> Open live room{todayTime ? ` (${timeLabel(todayTime.startTime)} today)` : ""}
            </Link>
          ) : (
            <span className="text-xs text-slate-500">The live room opens here on the day of each class.</span>
          )}
          <Link href="/bowbazar/attendance" className="btn-outline h-9 px-3 text-sm">
            <ClipboardCheck size={16} /> Register
          </Link>
        </div>
      )}
    </article>
  );
}

function MeetingRow({
  item,
  meeting,
  canEdit,
  onAction,
  onQuick,
}: {
  item: OnlineClass;
  meeting: Meeting;
  canEdit: boolean;
  onAction: (action: Action) => void;
  onQuick: QuickChange;
}) {
  const closed = meeting.cancelled || Boolean(meeting.movedTo);
  const when = `${shortDate(meeting.date)}, ${timeLabel(meeting.startTime)}–${timeLabel(meeting.endTime)}`;
  const movedMeeting = meeting.movedTo ? item.upcoming.find((other) => other.kind === "moved" && other.fromDate === meeting.date) : null;
  const items = closed
    ? [
        meeting.cancelled && {
          label: "Restore this class",
          icon: <Undo2 size={15} />,
          onClick: () => void onQuick(item, { action: "restore", date: meeting.date }, "Restore this class?", `${item.name} on ${when} goes ahead after all. Families are told.`),
        },
      ]
    : [
        { label: "Add students to this class only", icon: <UserPlus size={15} />, onClick: () => onAction({ kind: "guests", item, meeting }) },
        { label: "Reschedule", icon: <CalendarClock size={15} />, onClick: () => onAction({ kind: "reschedule", item, meeting }) },
        meeting.kind === "moved" && {
          label: "Put back on its usual day",
          icon: <Undo2 size={15} />,
          onClick: () =>
            void onQuick(item, { action: "undo_move", date: meeting.date }, "Put this class back?", `It goes back to ${shortDate(meeting.fromDate)} at the usual time. Families are told.`),
        },
        meeting.kind === "extra"
          ? {
              label: "Delete this extra class",
              icon: <Trash2 size={15} />,
              danger: true,
              onClick: () => void onQuick(item, { action: "remove_extra", date: meeting.date }, "Delete this extra class?", `The extra class on ${when} is removed. Families are told.`),
            }
          : { label: "Cancel this class", icon: <X size={15} />, danger: true, onClick: () => onAction({ kind: "cancel", item, meeting }) },
      ];
  return (
    <li className={cn("rounded-lg px-3 py-2 text-sm", closed ? "bg-slate-50 text-slate-500" : meeting.kind === "regular" ? "bg-sky-50/60" : "bg-violet-50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("font-bold", closed ? "line-through" : "text-slate-900")}>{when}</span>
        {meeting.cancelled && <Badge tone="bad">Cancelled</Badge>}
        {meeting.movedTo && (
          <Badge tone="warn">
            Moved to {shortDate(meeting.movedTo.date)}, {timeLabel(meeting.movedTo.startTime)}
            {!movedMeeting && " (later)"}
          </Badge>
        )}
        {meeting.kind === "moved" && meeting.fromDate !== meeting.date && <Badge tone="info">Moved from {shortDate(meeting.fromDate)}</Badge>}
        {meeting.kind === "moved" && meeting.fromDate === meeting.date && <Badge tone="info">New time</Badge>}
        {meeting.kind === "extra" && <Badge tone="brand">Extra class</Badge>}
        {meeting.reason && <span className="text-xs text-slate-500">· {meeting.reason}</span>}
        {canEdit && (
          <div className="ml-auto">
            <MoreMenu label={`Change the class on ${shortDate(meeting.date)}`} items={items} />
          </div>
        )}
      </div>
      {meeting.guests.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-xs text-slate-500">This class only:</span>
          {meeting.guests.map((guest) => (
            <span key={guest.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
              {guest.name}
              {canEdit && !closed && (
                <button
                  type="button"
                  aria-label={`Take ${guest.name} off this class`}
                  className="rounded-full hover:bg-emerald-200"
                  onClick={() =>
                    void onQuick(
                      item,
                      { action: "remove_guest", date: meeting.date, studentId: guest.id },
                      `Take ${guest.name} off?`,
                      `${guest.name} won't be on the ${shortDate(meeting.date)} class. No message is sent.`
                    )
                  }
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

const ACTION_TITLE: Record<Action["kind"], string> = {
  cancel: "Cancel a class",
  reschedule: "Reschedule a class",
  guests: "Add students to one class",
  extra: "Add an extra class",
  delete: "Delete this class",
};

const ACTION_BUTTON: Record<Action["kind"], string> = {
  cancel: "Cancel class",
  reschedule: "Reschedule",
  guests: "Add students",
  extra: "Add extra class",
  delete: "Delete class",
};

const ACTION_DONE: Record<Action["kind"], string> = {
  cancel: "Class cancelled.",
  reschedule: "Class rescheduled.",
  guests: "Students added.",
  extra: "Extra class added.",
  delete: "Class deleted.",
};

/** The pop-up for one change: what's needed, an optional reason, and whether to tell the families. */
function ActionDialog({ action, students, onClose, onDone }: { action: Action; students: Data["students"]; onClose: () => void; onDone: () => Promise<void> }) {
  const item = action.item;
  const meeting = "meeting" in action ? action.meeting : null;
  const [toDate, setToDate] = useState(meeting?.date || "");
  const [startTime, setStartTime] = useState(meeting?.startTime || item.startTime);
  const [endTime, setEndTime] = useState(meeting?.endTime || item.endTime);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const when = meeting ? `${shortDate(meeting.date)}, ${timeLabel(meeting.startTime)}–${timeLabel(meeting.endTime)}` : "";
  const pickStudents = action.kind === "guests" || action.kind === "extra";
  const confirmWord = (item.name || "delete").trim();

  const shown = useMemo(() => {
    const taken = new Set([...item.students.map((student) => student.id), ...(meeting?.guests || []).map((guest) => guest.id)]);
    const q = query.trim().toLowerCase();
    return students
      .filter((student) => !taken.has(student.id))
      .filter((student) => !q || `${student.name} ${student.regNo} ${student.level}`.toLowerCase().includes(q));
  }, [students, query, item.students, meeting]);

  async function save() {
    setSaving(true);
    try {
      let result: { told: Told };
      if (action.kind === "delete") {
        result = await api(`/api/bowbazar/online/${item.id}${notify ? "" : "?notify=0"}`, { method: "DELETE" });
      } else {
        const body =
          action.kind === "cancel"
            ? { action: "cancel", date: meeting!.date, reason, notify }
            : action.kind === "reschedule"
              ? { action: "reschedule", date: meeting!.date, toDate, startTime, endTime, reason, notify }
              : action.kind === "guests"
                ? { action: "add_guests", date: meeting!.date, studentIds: picked, notify }
                : { action: "extra", date: toDate, startTime, endTime, reason, studentIds: picked, notify };
        result = await api(`/api/bowbazar/online/${item.id}/sessions`, { method: "POST", json: body });
      }
      toast.success(`${ACTION_DONE[action.kind]}${toldLine(result.told)}`);
      await onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const blocked =
    saving ||
    (action.kind === "guests" && !picked.length) ||
    ((action.kind === "reschedule" || action.kind === "extra") && (!toDate || !startTime || !endTime)) ||
    (action.kind === "delete" && typed.trim().toLowerCase() !== confirmWord.toLowerCase());
  const danger = action.kind === "cancel" || action.kind === "delete";

  return (
    <Modal
      title={ACTION_TITLE[action.kind]}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>
            Back
          </button>
          <button type="button" className={cn("btn-primary h-10", danger && "bg-red-700 hover:bg-red-800")} disabled={blocked} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {ACTION_BUTTON[action.kind]}
          </button>
        </>
      }
    >
      <p className="font-bold text-slate-900">
        {item.name}
        {when && <span className="font-semibold text-slate-500"> · {when}</span>}
      </p>

      {action.kind === "delete" && (
        <>
          <p>
            The class stops for good: its {item.students.length} student{item.students.length === 1 ? " is" : "s are"} taken out of it and its upcoming changes go.
            Past registers stay in each student&apos;s history. To pause it instead, use Edit and untick &quot;Class is running&quot;.
          </p>
          <Field label={`Type "${confirmWord}" to confirm`}>
            <input className="input" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          </Field>
        </>
      )}

      {(action.kind === "reschedule" || action.kind === "extra") && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label={action.kind === "extra" ? "Date" : "New date"} className="col-span-2 sm:col-span-1">
            <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </Field>
          <Field label="Starts">
            <input className="input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </Field>
          <Field label="Ends">
            <input className="input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </Field>
        </div>
      )}

      {pickStudents && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-600">
            {action.kind === "extra"
              ? `Its ${item.students.length} weekly student${item.students.length === 1 ? " is" : "s are"} on it. Add others for this class only (optional):`
              : "Students joining this one class (their own classes don't change):"}
          </div>
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search by name, reg. no. or level" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {shown.map((student) => (
              <label key={student.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={picked.includes(student.id)}
                  onChange={() => setPicked((list) => (list.includes(student.id) ? list.filter((value) => value !== student.id) : [...list, student.id]))}
                />
                <span className="font-semibold text-slate-900">{student.name}</span>
                <span className="ml-auto text-xs text-slate-500">{[student.regNo, student.level].filter(Boolean).join(" · ")}</span>
              </label>
            ))}
            {!shown.length && <p className="px-3 py-4 text-center text-slate-500">No student matches.</p>}
          </div>
          <p className="text-xs text-slate-400">
            Seats: {item.students.length + (meeting?.guests.length || 0) + picked.length}/{item.capacity}
          </p>
        </div>
      )}

      {(action.kind === "cancel" || action.kind === "reschedule" || action.kind === "extra") && (
        <Field label="Reason (optional)" hint="Families see it in the portal and the email">
          <input className="input" value={reason} maxLength={200} placeholder={action.kind === "cancel" ? "Coach unwell" : ""} onChange={(event) => setReason(event.target.value)} />
        </Field>
      )}

      <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
        <span>
          <span className="font-bold text-slate-900">Tell {action.kind === "guests" ? "these families" : "the families"} and the coach</span>
          <br />
          In the portal, by email and on WhatsApp.
        </span>
      </label>
    </Modal>
  );
}

function ClassForm({ form: initial, data, onClose, onSaved }: { form: Form; data: Data; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form>(initial);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = Boolean(form.id);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? data.students.filter((student) => `${student.name} ${student.regNo} ${student.level}`.toLowerCase().includes(q))
      : data.students;
    // Picked students first, so they're easy to see and remove.
    return [...list].sort((a, b) => Number(form.studentIds.includes(b.id)) - Number(form.studentIds.includes(a.id)));
  }, [data.students, query, form.studentIds]);

  const toggleStudent = (studentId: string) =>
    set({ studentIds: form.studentIds.includes(studentId) ? form.studentIds.filter((value) => value !== studentId) : [...form.studentIds, studentId] });
  const toggleDay = (day: number) =>
    set({ days: editing ? [day] : form.days.includes(day) ? form.days.filter((value) => value !== day) : [...form.days, day] });

  async function save() {
    if (editing && !form.isActive && initial.isActive && form.studentIds.length) {
      if (!window.confirm(`Switch off ${form.name}? Its ${form.studentIds.length} students are taken out of it. Past registers stay.`)) return;
    }
    setSaving(true);
    try {
      const body = { ...form, dayOfWeek: form.days[0] };
      if (editing) await api(`/api/bowbazar/online/${form.id}`, { method: "PATCH", json: body });
      else await api("/api/bowbazar/online", { method: "POST", json: body });
      toast.success(editing ? "Class saved." : form.days.length > 1 ? `Class made for ${form.days.length} days a week.` : "Class made.");
      await onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={editing ? `Edit ${initial.name || "class"}` : "New online class"}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline h-10" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} {editing ? "Save class" : "Make class"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Class name" hint="What staff and families see, for example Upasana or Level 2 evening">
          <input className="input" value={form.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} />
        </Field>

        <Field label={editing ? "Day" : "Days"} hint={editing ? "Each day of a class is edited on its own." : "Pick every day it meets; each day gets its own register."}>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-bold",
                  form.days.includes(day) ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand/40"
                )}
                onClick={() => toggleDay(day)}
              >
                {DAY_NAMES[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Starts">
            <input className="input" type="time" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} />
          </Field>
          <Field label="Ends">
            <input className="input" type="time" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} />
          </Field>
          <Field label="Seats">
            <input className="input" type="number" min={1} max={50} value={form.capacity} onChange={(event) => set({ capacity: Number(event.target.value) })} />
          </Field>
        </div>

        <Field label="Coach" hint="Opens the live room and is named as its coach. Branch staff only.">
          <select className="input" value={form.coachId} onChange={(event) => set({ coachId: event.target.value })}>
            <option value="">No set coach</option>
            {data.coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name} ({coach.role})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Meeting link (optional)" hint="A Zoom or Meet link, if the class also uses one beside the live room">
          <input className="input" value={form.meetingUrl} placeholder="https://" onChange={(event) => set({ meetingUrl: event.target.value })} />
        </Field>

        {editing && (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={form.isActive} onChange={(event) => set({ isActive: event.target.checked })} />
            Class is running
          </label>
        )}

        {form.isActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">
                Students ({form.studentIds.length}/{form.capacity})
              </span>
              {form.studentIds.length > 0 && (
                <button type="button" className="text-xs font-bold text-slate-500 underline" onClick={() => set({ studentIds: [] })}>
                  Clear
                </button>
              )}
            </div>
            <label className="relative block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search by name, reg. no. or level" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {shown.map((student) => (
                <label key={student.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={form.studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                  <span className="font-semibold text-slate-900">{student.name}</span>
                  <span className="ml-auto text-xs text-slate-500">{[student.regNo, student.level].filter(Boolean).join(" · ")}</span>
                </label>
              ))}
              {!shown.length && <p className="px-3 py-4 text-center text-sm text-slate-500">No student matches.</p>}
            </div>
            <p className="text-xs text-slate-400">Students stay in their centre slots too. Their monthly fee is not changed here.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
