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
        "w-full rounded-2xl border px-3 py-2 text-left shadow-sm transition",
        active ? "border-brand bg-brand/5 shadow-brand/10" : "border-slate-200 bg-white hover:border-brand/20 hover:bg-brand/5"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-950">{event.title}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{format(eventDate(event.start), "h:mm a")} {event.subtitle ? `• ${event.subtitle}` : ""}</div>
        </div>
        <EventBadge label={prettyStatus(event.status)} className={statusTone(event.status)} />
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
      <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.08)]">
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
    <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.08)]">
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
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
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
  const [view, setView] = useState<CalendarView>("monthly");
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

  return (
    <div className="space-y-5 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_24px_60px_rgba(90,19,114,0.10)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">{role === "student" ? "Student Calendar" : role === "instructor" ? "Coach Calendar" : "Academy Calendar"}</div>
            <h1 className="mt-1 text-3xl font-black text-brand">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label="Today" value={todayEvents} icon={CalendarDays} />
            <SummaryCard label="Upcoming" value={upcomingEvents} icon={Clock3} />
            <SummaryCard label="Completed" value={completedEvents} icon={CheckCircle2} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-brand/10 bg-white p-4 shadow-[0_20px_50px_rgba(90,19,114,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCurrentDate(new Date())} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm">Today</button>
            <button type="button" onClick={() => setCurrentDate((current) => navigateDate(view, current, -1))} className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => setCurrentDate((current) => navigateDate(view, current, 1))} className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm"><ChevronRight size={16} /></button>
            <div className="ml-1 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-bold text-slate-900">
              <CalendarDays size={15} className="text-brand" />
              {formatRangeLabel(view, currentDate)}
            </div>
          </div>

          <div className="inline-flex flex-wrap gap-2 rounded-3xl bg-slate-50 p-1">
            {viewOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={cn(
                  "rounded-2xl px-4 py-2 text-sm font-bold transition",
                  view === item.id ? "bg-white text-slate-950 shadow-md" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              <Filter size={12} />
              Types
            </span>
            {typeOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTypeFilter(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  typeFilter === item.id ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-600 hover:border-brand/20 hover:text-slate-900"
                )}
              >
                {item.label}
                {item.id !== "all" && <span className="ml-2 text-xs text-slate-400">{eventCount(events, item.id)}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  statusFilter === item.id ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand/20 hover:text-slate-900"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {view === "monthly" && <CalendarMonth currentDate={currentDate} events={visibleEvents} selectedId={selectedId} onSelect={(event) => setSelectedId(event.id)} />}

          {view === "weekly" && (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
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

        <div className="space-y-5">
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
