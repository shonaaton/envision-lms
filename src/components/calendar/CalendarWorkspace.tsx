"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Filter,
  GraduationCap,
  ListTodo,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { cn } from "@/lib/utils";

type CalendarRole = "student" | "instructor" | "admin";
type CalendarView = "monthly" | "weekly" | "daily" | "agenda";
type CalendarType = "class" | "homework" | "tournament" | "simul" | "attendance" | "task" | "reminder";
type StatusFilter = "all" | "upcoming" | "completed";

export type CalendarEvent = {
  id: string;
  type: CalendarType;
  status: string;
  title: string;
  subtitle?: string;
  description?: string;
  start: string;
  end?: string;
  topic?: string;
  coachName?: string;
  batchLabel?: string;
  studentLabel?: string;
  durationLabel?: string;
  href?: string;
  hrefLabel?: string;
  meetingUrl?: string;
};

const typeOptions: Array<{ id: CalendarType | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "class", label: "Classes" },
  { id: "homework", label: "Homework" },
  { id: "tournament", label: "Tournaments" },
  { id: "simul", label: "Simuls" },
  { id: "attendance", label: "Attendance" },
  { id: "task", label: "Tasks" },
  { id: "reminder", label: "Reminders" },
];

const statusOptions: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
];

const viewOptions: Array<{ id: CalendarView; label: string }> = [
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
  { id: "agenda", label: "Agenda" },
];

function eventDate(value: string) {
  return new Date(value);
}

function statusBucket(event: CalendarEvent) {
  const state = String(event.status || "").toLowerCase();
  if (["completed", "present", "missed", "absent", "late", "cancelled"].includes(state)) return "completed";
  return "upcoming";
}

function typeTone(type: CalendarType) {
  if (type === "class") return "bg-sky-50 text-sky-700 border-sky-200";
  if (type === "homework") return "bg-amber-50 text-amber-700 border-amber-200";
  if (type === "tournament") return "bg-violet-50 text-violet-700 border-violet-200";
  if (type === "simul") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "attendance") return "bg-teal-50 text-teal-700 border-teal-200";
  if (type === "task") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusTone(status: string) {
  const value = String(status || "").toLowerCase();
  if (["completed", "present"].includes(value)) return "bg-emerald-50 text-emerald-700";
  if (["missed", "absent", "cancelled"].includes(value)) return "bg-rose-50 text-rose-700";
  if (["rescheduled", "late"].includes(value)) return "bg-amber-50 text-amber-700";
  if (["live", "ongoing"].includes(value)) return "bg-sky-50 text-sky-700";
  return "bg-brand/10 text-brand";
}

function prettyStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function sameDate(a: Date, b: Date) {
  return isSameDay(a, b);
}

function formatRangeLabel(view: CalendarView, currentDate: Date) {
  if (view === "monthly") return format(currentDate, "MMMM yyyy");
  if (view === "weekly") {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return `${format(weekStart, "d MMM")} - ${format(weekEnd, "d MMM yyyy")}`;
  }
  return format(currentDate, "EEEE, d MMMM yyyy");
}

function navigateDate(view: CalendarView, currentDate: Date, direction: -1 | 1) {
  if (view === "monthly") return direction === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
  if (view === "weekly") return direction === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1);
  return addDays(currentDate, direction);
}

function eventCount(events: CalendarEvent[], type: CalendarType | "all") {
  return type === "all" ? events.length : events.filter((event) => event.type === type).length;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

function EventBadge({ label, className }: { label: string; className: string }) {
  return <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold", className)}>{label}</span>;
}

function EventChip({
  event,
  active,
  onClick,
}: {
  event: CalendarEvent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={event.title}
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border px-3 py-3 text-left shadow-sm transition sm:px-4",
        active ? "border-brand bg-brand/5 shadow-brand/10" : "border-slate-200 bg-white hover:border-brand/20 hover:bg-brand/5"
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950 sm:truncate">{event.title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500 sm:truncate">{format(eventDate(event.start), "h:mm a")} {event.subtitle ? `• ${event.subtitle}` : ""}</div>
        </div>
        <div className="shrink-0">
          <EventBadge label={prettyStatus(event.status)} className={statusTone(event.status)} />
        </div>
      </div>
    </button>
  );
}

function DayEvents({
  day,
  events,
  selectedId,
  onSelect,
}: {
  day: Date;
  events: CalendarEvent[];
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const dayEvents = events
    .filter((event) => sameDate(eventDate(event.start), day))
    .sort((a, b) => eventDate(a.start).getTime() - eventDate(b.start).getTime());

  return (
    <div className={cn("rounded-3xl border p-3", isToday(day) ? "border-brand/25 bg-brand/[0.03]" : "border-slate-200 bg-white/80")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{format(day, "EEE")}</div>
          <div className="text-lg font-black text-slate-950">{format(day, "d MMM")}</div>
        </div>
        {isToday(day) && <EventBadge label="Today" className="bg-brand/10 text-brand border-brand/20" />}
      </div>
      <div className="space-y-2">
        {dayEvents.length ? dayEvents.map((event) => (
          <EventChip key={event.id} event={event} active={selectedId === event.id} onClick={() => onSelect(event)} />
        )) : <div className="rounded-2xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">No events</div>}
      </div>
    </div>
  );
}

function CalendarMonth({
  currentDate,
  events,
  selectedId,
  onSelect,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
  });

  return (
    <div className="overflow-hidden rounded-[28px] border border-brand/10 bg-white shadow-[0_20px_50px_rgba(90,19,114,0.08)]">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="px-3 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-500">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((event) => sameDate(eventDate(event.start), day)).sort((a, b) => eventDate(a.start).getTime() - eventDate(b.start).getTime());
          const visible = dayEvents.slice(0, 3);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[150px] border-b border-r border-slate-200 p-2 align-top md:min-h-[170px]",
                !isSameMonth(day, currentDate) && "bg-slate-50/80",
                isToday(day) && "bg-brand/[0.03]"
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", isToday(day) ? "bg-brand text-white" : "text-slate-700")}>
                  {format(day, "d")}
                </span>
                {dayEvents.length > 0 && <span className="text-[11px] font-bold text-slate-400">{dayEvents.length} item{dayEvents.length === 1 ? "" : "s"}</span>}
              </div>
              <div className="space-y-1.5">
                {visible.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    title={event.title}
                    onClick={() => onSelect(event)}
                    className={cn(
                      "w-full truncate rounded-xl border px-2.5 py-1.5 text-left text-xs font-semibold shadow-sm transition",
                      typeTone(event.type),
                      selectedId === event.id ? "ring-2 ring-brand/25" : ""
                    )}
                  >
                    {format(eventDate(event.start), "h:mm a")} • {event.title}
                  </button>
                ))}
                {dayEvents.length > visible.length && (
                  <div className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
                    +{dayEvents.length - visible.length} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarAgenda({
  events,
  selectedId,
  onSelect,
}: {
  events: CalendarEvent[];
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const groups = events.reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
    const key = format(eventDate(event.start), "yyyy-MM-dd");
    if (!accumulator[key]) accumulator[key] = [];
    accumulator[key].push(event);
    return accumulator;
  }, {});
  const keys = Object.keys(groups).sort();

  if (!keys.length) return <EmptyState label="No events match your current filters." />;

  return (
    <div className="space-y-4">
      {keys.map((key) => (
        <div key={key} className="rounded-[28px] border border-brand/10 bg-white p-4 shadow-[0_20px_50px_rgba(90,19,114,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{format(new Date(key), "EEEE")}</div>
              <div className="text-xl font-black text-slate-950">{format(new Date(key), "d MMMM yyyy")}</div>
            </div>
            <EventBadge label={`${groups[key].length} events`} className="bg-slate-100 text-slate-600 border-slate-200" />
          </div>
          <div className="space-y-3">
            {groups[key]
              .sort((a, b) => eventDate(a.start).getTime() - eventDate(b.start).getTime())
              .map((event) => (
                <EventChip key={event.id} event={event} active={selectedId === event.id} onClick={() => onSelect(event)} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventDetails({ event, role }: { event?: CalendarEvent; role: CalendarRole }) {
  if (!event) {
    return (
      <div className="rounded-[28px] border border-brand/10 bg-white p-4 shadow-[0_20px_50px_rgba(90,19,114,0.08)] sm:p-5 xl:sticky xl:top-24">
        <div className="flex items-center gap-2 text-brand">
          <CalendarDays size={18} />
          <div className="text-sm font-black uppercase tracking-[0.18em]">Event Details</div>
        </div>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Select an event to see the full class, homework, or tournament details here.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-brand/10 bg-white p-4 shadow-[0_20px_50px_rgba(90,19,114,0.08)] sm:p-5 xl:sticky xl:top-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <EventBadge label={event.type.replace("_", " ").replace(/\b\w/g, (value) => value.toUpperCase())} className={typeTone(event.type)} />
            <EventBadge label={prettyStatus(event.status)} className={statusTone(event.status)} />
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{event.title}</h2>
          {event.subtitle && <p className="mt-1 text-sm text-slate-600">{event.subtitle}</p>}
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Scheduled</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{format(eventDate(event.start), "EEE, d MMM • h:mm a")}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <DetailRow icon={<Clock3 size={15} />} label="Duration" value={event.durationLabel || "Not specified"} />
        {event.topic && <DetailRow icon={<Sparkles size={15} />} label="Topic" value={event.topic} />}
        {event.coachName && <DetailRow icon={<GraduationCap size={15} />} label={role === "student" ? "Coach" : "Lead Coach"} value={event.coachName} />}
        {event.batchLabel && <DetailRow icon={<Users size={15} />} label="Batches" value={event.batchLabel} />}
        {event.studentLabel && <DetailRow icon={<Users size={15} />} label="Students" value={event.studentLabel} />}
        {event.description && <DetailRow icon={<ListTodo size={15} />} label="Details" value={event.description} />}
      </div>

      {(event.href || event.meetingUrl) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {event.href && (
            <Link href={event.href} className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20">
              {event.hrefLabel || "Open"}
            </Link>
          )}
          {event.meetingUrl && (
            <a href={event.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900">
              <ExternalLink size={15} />
              Join Google Meet
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function studentCalendarTypeTone(type: CalendarType) {
  if (type === "class") return "border-sky-100 bg-sky-50 text-sky-700";
  if (type === "homework") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-violet-100 bg-violet-50 text-violet-700";
}

function studentCalendarTypeLabel(type: CalendarType) {
  if (type === "class") return "Class";
  if (type === "homework") return "Homework";
  return "Tournament";
}

function StudentEventCard({ event }: { event: CalendarEvent }) {
  const date = eventDate(event.start);
  return (
    <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_12px_32px_rgba(90,19,114,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-black", studentCalendarTypeTone(event.type))}>
              {studentCalendarTypeLabel(event.type)}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", statusTone(event.status))}>
              {prettyStatus(event.status)}
            </span>
          </div>
          <h3 className="mt-3 line-clamp-2 text-lg font-black text-slate-950">{event.title}</h3>
          {event.subtitle && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{event.subtitle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="rounded-xl bg-slate-50 px-3 py-1.5 font-semibold">{format(date, "h:mm a")}</span>
            {event.durationLabel && <span className="rounded-xl bg-slate-50 px-3 py-1.5 font-semibold">{event.durationLabel}</span>}
          </div>
        </div>
        {event.href && (
          <Link href={event.href} className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white shadow-lg shadow-brand/20">
            {event.hrefLabel || "Open"}
          </Link>
        )}
      </div>
    </article>
  );
}

function StudentCalendarWorkspace({ title, subtitle, events }: { title: string; subtitle: string; events: CalendarEvent[] }) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const studentEvents = useMemo(
    () =>
      events
        .filter((event) => event.type === "class" || event.type === "homework" || event.type === "tournament")
        .sort((a, b) => eventDate(a.start).getTime() - eventDate(b.start).getTime()),
    [events]
  );
  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      }),
    [currentDate]
  );
  const dayEvents = studentEvents.filter((event) => sameDate(eventDate(event.start), currentDate));
  const upcomingEvents = studentEvents.filter((event) => startOfDay(eventDate(event.start)) >= startOfDay(new Date())).slice(0, 8);
  const classCount = studentEvents.filter((event) => event.type === "class").length;
  const homeworkCount = studentEvents.filter((event) => event.type === "homework").length;
  const tournamentCount = studentEvents.filter((event) => event.type === "tournament").length;

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-[26px] border border-brand/10 bg-white p-4 shadow-[0_18px_48px_rgba(90,19,114,0.10)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-brand/70">Student Calendar</div>
            <h1 className="mt-1 text-3xl font-black text-brand">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">{subtitle}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-700">Classes</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{classCount}</div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Homework</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{homeworkCount}</div>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Tournaments</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{tournamentCount}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-brand/10 bg-white p-3 shadow-[0_14px_34px_rgba(90,19,114,0.08)] sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentDate(new Date())} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-950 shadow-sm">
              Today
            </button>
            <button type="button" onClick={() => setCurrentDate((date) => addDays(date, -1))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
              <ChevronLeft size={17} />
            </button>
            <button type="button" onClick={() => setCurrentDate((date) => addDays(date, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-brand/5 px-3 py-2 text-sm font-black text-brand">
            <CalendarDays size={16} />
            {format(currentDate, "EEEE, d MMM yyyy")}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const count = studentEvents.filter((event) => sameDate(eventDate(event.start), day)).length;
            const active = sameDate(day, currentDate);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setCurrentDate(day)}
                className={cn(
                  "min-h-[64px] rounded-2xl border px-1 py-2 text-center transition",
                  active ? "border-brand bg-brand text-white shadow-lg shadow-brand/20" : "border-slate-200 bg-white text-slate-700 hover:border-brand/30"
                )}
              >
                <div className={cn("text-[10px] font-black uppercase tracking-[0.12em]", active ? "text-white/80" : "text-slate-400")}>{format(day, "EEE")}</div>
                <div className="mt-1 text-lg font-black">{format(day, "d")}</div>
                {count > 0 && <div className={cn("mx-auto mt-1 h-1.5 w-1.5 rounded-full", active ? "bg-accent" : "bg-brand")} />}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[26px] border border-brand/10 bg-white p-4 shadow-[0_16px_42px_rgba(90,19,114,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{format(currentDate, "EEE")}</div>
              <h2 className="text-2xl font-black text-slate-950">{format(currentDate, "d MMM")}</h2>
            </div>
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-black text-brand">{dayEvents.length} items</span>
          </div>
          <div className="space-y-3">
            {dayEvents.length ? dayEvents.map((event) => <StudentEventCard key={event.id} event={event} />) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Nothing scheduled for this day.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[26px] border border-brand/10 bg-white p-4 shadow-[0_16px_42px_rgba(90,19,114,0.08)]">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-950">Upcoming</h2>
            <p className="text-sm text-slate-500">Your next classes, homework, and tournaments.</p>
          </div>
          <div className="space-y-2">
            {upcomingEvents.length ? upcomingEvents.map((event) => (
              <Link key={event.id} href={event.href || "#"} className="block rounded-2xl border border-slate-100 bg-slate-50 p-3 hover:border-brand/20 hover:bg-brand/5">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-black", studentCalendarTypeTone(event.type))}>{studentCalendarTypeLabel(event.type)}</span>
                  <span className="text-xs font-bold text-slate-400">{format(eventDate(event.start), "d MMM")}</span>
                </div>
                <div className="mt-2 line-clamp-1 text-sm font-black text-slate-950">{event.title}</div>
                <div className="mt-1 text-xs text-slate-500">{format(eventDate(event.start), "h:mm a")}</div>
              </Link>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">No upcoming items.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function CalendarWorkspace({
  role,
  title,
  subtitle,
  events,
}: {
  role: CalendarRole;
  title: string;
  subtitle: string;
  events: CalendarEvent[];
}) {
  if (role === "student") {
    return <StudentCalendarWorkspace title={title} subtitle={subtitle} events={events} />;
  }

  return <StaffCalendarWorkspace role={role} title={title} subtitle={subtitle} events={events} />;
}

function StaffCalendarWorkspace({
  role,
  title,
  subtitle,
  events,
}: {
  role: CalendarRole;
  title: string;
  subtitle: string;
  events: CalendarEvent[];
}) {

  const [view, setView] = useState<CalendarView>("daily");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [typeFilter, setTypeFilter] = useState<CalendarType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string>("");

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => typeFilter === "all" || event.type === typeFilter)
      .filter((event) => statusFilter === "all" || statusBucket(event) === statusFilter)
      .sort((a, b) => eventDate(a.start).getTime() - eventDate(b.start).getTime());
  }, [events, statusFilter, typeFilter]);

  const visibleEvents = useMemo(() => {
    if (view === "agenda") return filteredEvents;
    if (view === "daily") return filteredEvents.filter((event) => sameDate(eventDate(event.start), currentDate));
    if (view === "weekly") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return filteredEvents.filter((event) => {
        const value = startOfDay(eventDate(event.start));
        return value >= weekStart && value <= weekEnd;
      });
    }
    const monthStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return filteredEvents.filter((event) => {
      const value = startOfDay(eventDate(event.start));
      return value >= monthStart && value <= monthEnd;
    });
  }, [currentDate, filteredEvents, view]);

  useEffect(() => {
    if (!visibleEvents.length) {
      setSelectedId("");
      return;
    }
    if (!visibleEvents.some((event) => event.id === selectedId)) {
      setSelectedId(visibleEvents[0].id);
    }
  }, [selectedId, visibleEvents]);

  const selectedEvent = visibleEvents.find((event) => event.id === selectedId);
  const todayEvents = filteredEvents.filter((event) => sameDate(eventDate(event.start), new Date())).length;
  const upcomingEvents = filteredEvents.filter((event) => statusBucket(event) === "upcoming").length;
  const completedEvents = filteredEvents.filter((event) => statusBucket(event) === "completed").length;
  const currentDateValue = format(currentDate, "yyyy-MM-dd");
  const staffLabel = role === "instructor" ? "Coach Calendar" : "Academy Calendar";

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white p-4 shadow-[0_16px_38px_rgba(90,19,114,0.08)] sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">{staffLabel}</div>
            <h1 className="mt-1 text-3xl font-black text-brand">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SummaryCard label="Today" value={todayEvents} icon={CalendarDays} />
            <SummaryCard label="Upcoming" value={upcomingEvents} icon={Clock3} />
            <SummaryCard label="Completed" value={completedEvents} icon={CheckCircle2} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-brand/10 bg-white p-3 shadow-[0_14px_34px_rgba(90,19,114,0.07)] sm:p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCurrentDate(new Date())} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 shadow-sm">Today</button>
              <button type="button" onClick={() => setCurrentDate((current) => navigateDate(view, current, -1))} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"><ChevronLeft size={17} /></button>
              <button type="button" onClick={() => setCurrentDate((current) => navigateDate(view, current, 1))} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"><ChevronRight size={17} /></button>
              <div className="min-w-0 inline-flex max-w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                <CalendarDays size={16} className="shrink-0 text-brand" />
                <span className="truncate">{formatRangeLabel(view, currentDate)}</span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="overflow-x-auto pb-1">
                <div className="inline-flex min-w-full gap-1 rounded-2xl bg-slate-50 p-1">
                  {viewOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setView(item.id)}
                      className={cn(
                        "min-h-[44px] flex-1 rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap transition",
                        view === item.id ? "bg-white text-slate-950 shadow-md" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Jump To Date</span>
                <input
                  type="date"
                  value={currentDateValue}
                  onChange={(event) => {
                    const next = event.target.value ? new Date(`${event.target.value}T12:00:00`) : new Date();
                    if (!Number.isNaN(next.getTime())) setCurrentDate(next);
                  }}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-brand"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Visible Items</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{visibleEvents.length}</div>
            <div className="mt-1 text-sm text-slate-500">After current view and filter selection</div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex min-w-full items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                <Filter size={12} />
                Types
              </span>
              {typeOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTypeFilter(item.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition",
                    typeFilter === item.id ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-600 hover:border-brand/20 hover:text-slate-900"
                  )}
                >
                  {item.label}
                  {item.id !== "all" && <span className="ml-2 text-xs text-slate-400">{eventCount(events, item.id)}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="inline-flex min-w-full items-center gap-2">
              {statusOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatusFilter(item.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition",
                    statusFilter === item.id ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand/20 hover:text-slate-900"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {view === "monthly" && <CalendarMonth currentDate={currentDate} events={visibleEvents} selectedId={selectedId} onSelect={(event) => setSelectedId(event.id)} />}

          {view === "weekly" && (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {eachDayOfInterval({
                start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                end: endOfWeek(currentDate, { weekStartsOn: 1 }),
              }).map((day) => (
                <DayEvents key={day.toISOString()} day={day} events={visibleEvents} selectedId={selectedId} onSelect={(event) => setSelectedId(event.id)} />
              ))}
            </div>
          )}

          {view === "daily" && (
            <div className="space-y-4">
              <DayEvents day={currentDate} events={visibleEvents} selectedId={selectedId} onSelect={(event) => setSelectedId(event.id)} />
            </div>
          )}

          {view === "agenda" && <CalendarAgenda events={visibleEvents} selectedId={selectedId} onSelect={(event) => setSelectedId(event.id)} />}

          {!visibleEvents.length && <EmptyState label="No events match your current filters." />}
        </div>

        <div className="space-y-3">
          <EventDetails event={selectedEvent} role={role} />

          <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.08)]">
            <div className="mb-4 flex items-center gap-2 text-brand">
              <ClipboardCheck size={18} />
              <div className="text-sm font-black uppercase tracking-[0.18em]">At a glance</div>
            </div>
            <div className="grid gap-3">
              <SummaryLine icon={<GraduationCap size={16} />} label="Classes" value={filteredEvents.filter((event) => event.type === "class").length} />
              <SummaryLine icon={<ListTodo size={16} />} label="Homework & tasks" value={filteredEvents.filter((event) => event.type === "homework" || event.type === "task" || event.type === "attendance").length} />
              <SummaryLine icon={<Trophy size={16} />} label="Tournaments & simuls" value={filteredEvents.filter((event) => event.type === "tournament" || event.type === "simul").length} />
              <SummaryLine icon={<Swords size={16} />} label="Active view items" value={visibleEvents.length} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryLine({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <span className="text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}
