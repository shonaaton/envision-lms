"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Armchair,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  IndianRupee,
  KeyRound,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Repeat,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { monthLabel } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { Badge, BranchHeader, CredentialsNote, Drawer, EmptyState, Field, ModeBadge, Panel, Stat, api, rupees, useConfirm, type BadgeTone } from "./shared";

type TodayClass = {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  mode: string;
  members: number;
  holiday: string;
  saved: boolean;
  counts: { attended: number; absent: number; excused: number; marked: number } | null;
};

type Overview = {
  admissionsToReview: number;
  changesToReview: number;
  loginsNotSent: number;
  detailsMissing: number;
  missingClasses: { id: string; name: string; phone: string; parentName: string; missed: number }[];
  activeStudents: number;
  inactiveStudents: number;
  slots: number;
  seats: number;
  freeSeats: number;
  fullSlots: number;
  month: string;
  totals: { billed: number; collected: number; pending: number; pendingCount: number } | null;
  today: { date: string; classes: TodayClass[] };
};
type Staff = { id: string; name: string; email: string; phone: string; username: string; branchRole: string; isActive: boolean; lastLoginAt: string | null };

/** Minutes since midnight on the academy's (Kolkata) clock, worked out from UTC so no locale can print hour "24". */
function kolkataMinutes(now = new Date()) {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
}
const toMinutes = (time: string) => {
  const [hours, minutes] = (time || "0:0").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};
function clock(time: string) {
  const minutes = toMinutes(time);
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Where a class stands right now: the badge it shows, and whether its register is overdue. */
function classState(item: TodayClass, now: number): { tone: BadgeTone; label: string; overdue: boolean; live: boolean } {
  if (item.holiday) return { tone: "muted", label: "Holiday", overdue: false, live: false };
  if (item.saved && item.counts) return { tone: "good", label: `Marked · ${item.counts.attended} came`, overdue: false, live: false };
  const start = toMinutes(item.startTime);
  const end = item.endTime ? toMinutes(item.endTime) : start + 60;
  if (now >= start && now < end) return { tone: "info", label: "On now", overdue: false, live: true };
  if (now >= end) return { tone: "bad", label: "Not marked", overdue: true, live: false };
  return { tone: "muted", label: `Starts ${clock(item.startTime)}`, overdue: false, live: false };
}

export default function OverviewClient({ can }: { can: string[] }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [now, setNow] = useState(() => kolkataMinutes());

  useEffect(() => {
    api<Overview>("/api/bowbazar/overview").then(setOverview).catch((error) => toast.error(error.message));
    const timer = window.setInterval(() => setNow(kolkataMinutes()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const canAttendance = can.includes("attendance");
  const canStudents = can.includes("students");
  const todayLabel = overview
    ? new Date(`${overview.today.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
    : "";

  const classes = overview?.today.classes || [];
  const states = classes.map((item) => classState(item, now));
  const overdue = classes.filter((_, index) => states[index].overdue);
  const markedCount = classes.filter((item) => item.saved).length;
  const teachable = classes.filter((item) => !item.holiday).length;

  // Everything waiting on someone, most urgent first; each one opens the screen that clears it.
  const attention: { key: string; icon: ReactNode; tone: BadgeTone; title: string; hint: string; href: string; action: string }[] = [];
  if (overview) {
    if (canAttendance && overdue.length) {
      attention.push({
        key: "registers",
        icon: <ClipboardCheck size={18} />,
        tone: "bad",
        title: `${plural(overdue.length, "register")} not marked today`,
        hint: overdue.map((item) => item.label).join(", "),
        href: `/bowbazar/attendance?slot=${overdue[0].slotId}`,
        action: "Mark now",
      });
    }
    if (canStudents && overview.admissionsToReview) {
      attention.push({
        key: "admissions",
        icon: <UserPlus size={18} />,
        tone: "info",
        title: `${plural(overview.admissionsToReview, "admission form")} to review`,
        hint: "Filled in by families and waiting for your approval.",
        href: "/bowbazar/admissions",
        action: "Review",
      });
    }
    if (canStudents && overview.changesToReview) {
      attention.push({
        key: "changes",
        icon: <Repeat size={18} />,
        tone: "warn",
        title: `${plural(overview.changesToReview, "class time change")} waiting`,
        hint: "Students asked to move to another class.",
        href: "/bowbazar/changes",
        action: "Answer",
      });
    }
    if (overview.totals && overview.totals.pending > 0) {
      attention.push({
        key: "fees",
        icon: <IndianRupee size={18} />,
        tone: "bad",
        title: `${rupees(overview.totals.pending)} still due for ${monthLabel(overview.month)}`,
        hint: `${plural(overview.totals.pendingCount, "bill")} not fully paid.`,
        href: "/bowbazar/fees",
        action: "Collect",
      });
    }
    if (overview.missingClasses.length) {
      attention.push({
        key: "missing",
        icon: <AlertTriangle size={18} />,
        tone: "warn",
        title: `${plural(overview.missingClasses.length, "student")} missing classes`,
        hint: "Absent several times in a row. A call often brings them back.",
        href: "#missing",
        action: "See who",
      });
    }
    if (overview.loginsNotSent) {
      attention.push({
        key: "logins",
        icon: <KeyRound size={18} />,
        tone: "muted",
        title: `${plural(overview.loginsNotSent, "family", "families")} without their login`,
        hint: "Send the welcome message with a set-password link.",
        href: "/bowbazar/students?filter=nologin",
        action: "Send",
      });
    }
    if (overview.detailsMissing) {
      attention.push({
        key: "details",
        icon: <FileText size={18} />,
        tone: "muted",
        title: `${plural(overview.detailsMissing, "student")} without a details form`,
        hint: "Photo, ID and parents' details not received yet.",
        href: "/bowbazar/students?filter=nodetails",
        action: "Send form",
      });
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Today"
        subtitle={todayLabel || "Your classes and what needs doing at the centre."}
        can={can}
        actions={
          <>
            {canStudents && (
              <Link href="/bowbazar/students?new=1" className="btn-primary h-10">
                <Plus size={16} /> Add a student
              </Link>
            )}
            {canAttendance && (
              <Link href="/bowbazar/attendance" className="btn-outline h-10">
                <ClipboardCheck size={16} /> Registers
              </Link>
            )}
          </>
        }
      />
      {!overview && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading today...
        </div>
      )}
      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat
              label="Today's classes"
              value={teachable ? `${markedCount}/${teachable}` : "None"}
              hint={teachable ? "registers marked" : "No class today"}
              tone={overdue.length ? "bad" : teachable && markedCount >= teachable ? "good" : "default"}
              icon={<CalendarClock size={16} />}
              href={canAttendance ? "/bowbazar/attendance" : undefined}
            />
            <Stat
              label="Active students"
              value={overview.activeStudents}
              hint={`${overview.inactiveStudents} inactive`}
              icon={<Users size={16} />}
              href="/bowbazar/students"
            />
            <Stat
              label="Free seats"
              value={overview.freeSeats}
              tone={overview.freeSeats ? "good" : "warn"}
              hint={`of ${overview.seats} · ${plural(overview.fullSlots, "full slot")}`}
              icon={<Armchair size={16} />}
              href="/bowbazar/slots"
            />
            {overview.totals ? (
              <Stat
                label={`Due · ${monthLabel(overview.month)}`}
                value={rupees(overview.totals.pending)}
                tone={overview.totals.pending ? "bad" : "good"}
                hint={`${rupees(overview.totals.collected)} of ${rupees(overview.totals.billed)} in`}
                icon={<IndianRupee size={16} />}
                href="/bowbazar/fees"
              />
            ) : (
              <Stat
                label="Missing classes"
                value={overview.missingClasses.length}
                tone={overview.missingClasses.length ? "warn" : "good"}
                hint="absent in a row"
                icon={<AlertTriangle size={16} />}
                href="#missing"
              />
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel
              className="lg:col-span-3"
              title="Today's classes"
              subtitle={teachable ? `${plural(teachable, "class", "classes")} · ${markedCount} marked` : undefined}
            >
              {!classes.length ? (
                <EmptyState icon={<CalendarClock size={20} />} title="No classes today" hint="Nothing is on the timetable for this day." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {classes.map((item, index) => {
                    const state = states[index];
                    return (
                      <li key={item.slotId} className={cn("flex items-center gap-3 px-4 py-3", state.live && "bg-sky-50/60")}>
                        <div className="w-16 shrink-0 text-center">
                          <div className="text-sm font-black text-slate-950">{clock(item.startTime)}</div>
                          {item.endTime && <div className="text-[11px] text-slate-400">to {clock(item.endTime)}</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-slate-900">{item.label}</span>
                            {item.mode === "online" && <ModeBadge mode="online" />}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <Badge tone={state.tone} dot={state.live}>{state.label}</Badge>
                            <span>{item.holiday || plural(item.members, "student")}</span>
                          </div>
                        </div>
                        {canAttendance && !item.holiday && (
                          <Link
                            href={`/bowbazar/attendance?slot=${item.slotId}`}
                            className={cn("h-9 shrink-0 px-3 text-xs", state.overdue || state.live ? "btn-primary" : "btn-outline")}
                          >
                            {state.overdue || state.live ? "Mark now" : "Open"}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel className="lg:col-span-2" title="Needs attention" subtitle={attention.length ? "Tap one to deal with it." : undefined}>
              {!attention.length ? (
                <EmptyState icon={<CheckCircle2 size={20} />} title="All clear" hint="Nothing is waiting on you right now." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {attention.map((item) => (
                    <li key={item.key}>
                      <Link href={item.href} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            item.tone === "bad" && "bg-red-50 text-red-700",
                            item.tone === "warn" && "bg-amber-50 text-amber-700",
                            item.tone === "info" && "bg-sky-50 text-sky-700",
                            item.tone === "muted" && "bg-slate-100 text-slate-600"
                          )}
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-900">{item.title}</span>
                          <span className="block truncate text-xs text-slate-500">{item.hint}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-brand">
                          {item.action}
                          <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {overview.missingClasses.length > 0 && (
            <div id="missing" className="scroll-mt-4">
              <Panel title="Missing classes" subtitle="Absent from their most recent classes in a row. A call often brings them back.">
                <ul className="divide-y divide-slate-100">
                  {overview.missingClasses.map((student) => (
                    <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-bold text-slate-900">{student.name}</span>
                        <span className="block text-xs text-slate-500">{[student.parentName, student.phone].filter(Boolean).join(" · ") || "No phone saved"}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone="bad">Missed {student.missed} in a row</Badge>
                        {student.phone && (
                          <>
                            <a href={`tel:+91${student.phone}`} className="btn-outline h-9 px-3 text-xs" aria-label={`Call ${student.name}`}>
                              <Phone size={14} /> Call
                            </a>
                            <a
                              href={`https://wa.me/91${student.phone}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-outline h-9 px-3 text-xs"
                              aria-label={`WhatsApp ${student.name}`}
                            >
                              <MessageCircle size={14} /> WhatsApp
                            </a>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}
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
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    api<{ staff: Staff[] }>("/api/bowbazar/staff").then((data) => setStaff(data.staff)).catch((error) => toast.error(error.message));
  }, []);
  useEffect(() => load(), [load]);

  async function toggle(member: Staff) {
    if (
      member.isActive &&
      !(await confirm({ title: `Switch off ${member.name}'s login?`, message: "They can't sign in until you reactivate them.", confirmLabel: "Deactivate", danger: true }))
    )
      return;
    try {
      await api(`/api/bowbazar/staff/${member.id}`, { method: "PATCH", json: { isActive: !member.isActive } });
      toast.success(member.isActive ? `${member.name} deactivated.` : `${member.name} can sign in again.`);
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <Panel
      title="Branch staff"
      subtitle="Logins that open only the Bowbazar portal, tournaments and the teaching tools. Managers handle students and fees; coaches take attendance."
      actions={
        <button type="button" className="btn-primary h-9" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add
        </button>
      }
    >
      {confirmDialog}
      {created && (
        <div className="p-4">
          <div className="mb-1 text-sm font-bold">{created.name}</div>
          <CredentialsNote username={created.username} password={created.password} />
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {!staff.length && <EmptyState icon={<Users size={20} />} title="No branch staff yet" hint="Add a manager or a coach to give them a login." />}
        {staff.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-950">
                {member.name}
                <Badge tone="brand" className="capitalize">{member.branchRole}</Badge>
                {!member.isActive && <Badge tone="muted">Inactive</Badge>}
              </div>
              <div className="truncate text-xs text-slate-500">{[member.username, member.email, member.phone].filter(Boolean).join(" · ")}</div>
            </div>
            {member.branchRole !== "admin" && (
              <button type="button" className="btn-outline h-9 shrink-0 px-3 text-xs" onClick={() => void toggle(member)}>
                {member.isActive ? "Deactivate" : "Reactivate"}
              </button>
            )}
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
    </Panel>
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
      subtitle="They get a login for the Bowbazar portal only."
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
      <Field label="Phone"><input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} /></Field>
      <Field label="Role">
        <select className="input" value={form.branchRole} onChange={(event) => set({ branchRole: event.target.value })}>
          <option value="manager">Branch manager: students, slots, fees</option>
          <option value="coach">Coach: view students and slots</option>
        </select>
      </Field>
    </Drawer>
  );
}
