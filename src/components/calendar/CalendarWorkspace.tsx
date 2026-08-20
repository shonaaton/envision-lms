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
  Eye,
  ExternalLink,
  Filter,
  GraduationCap,
  LayoutGrid,
  ListTodo,
  Rows3,
  Sparkles,
  SlidersHorizontal,
  Swords,
  Trophy,
  Users,
  X,
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
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";

type CalendarRole = "student" | "instructor" | "admin" | "sub-admin";
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

function eventTypeLabel(type: CalendarType) {
  return type.replace("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function EventLegend() {
  return (
    <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1">
      {typeOptions.filter((item) => item.id !== "all").map((item) => (
        <span key={item.id} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", typeTone(item.id as CalendarType))}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
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
        "group relative w-full rounded-xl border px-3 py-2 text-left shadow-sm transition",
        active
          ? "border-brand bg-brand/5 shadow-brand/10"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand/20 hover:bg-brand/5 hover:shadow-md"
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950 sm:truncate">{event.title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500 sm:truncate">
            <span className="font-bold text-slate-700">{format(eventDate(event.start), "h:mm a")}</span>
            {event.subtitle ? ` - ${event.subtitle}` : ""}
          </div>
        </div>
        <div className="shrink-0">
          <EventBadge label={prettyStatus(event.status)} className={statusTone(event.status)} />
        </div>
      </div>
      <EventHoverCard event={event} />
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
    <div className={cn("rounded-lg border p-3", isToday(day) ? "border-brand/25 bg-brand/[0.03]" : "border-slate-200 bg-white/80")}>
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
        )) : <div className="rounded-lg bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">No events</div>}
      </div>
    </div>
  );
}

function CalendarMonth({
  currentDate,
  events,
  selectedId,
  onSelect,
  onOpenDay,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
  onOpenDay: (day: Date, events: CalendarEvent[]) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-[0_12px_28px_rgba(90,19,114,0.08)]">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="px-3 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-500">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((event) => sameDate(eventDate(event.start), day)).sort((a, b) => eventDate(a.start).getTime() - eventDate(b.start).getTime());
          const visible = dayEvents.slice(0, 2);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[112px] border-b border-r border-slate-200 bg-white/90 p-2 align-top md:min-h-[128px]",
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
                      "group relative w-full truncate rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                      typeTone(event.type),
                      selectedId === event.id ? "border-brand bg-brand/10 text-brand ring-2 ring-brand/25" : ""
                    )}
                  >
                    {format(eventDate(event.start), "h:mm a")} - {event.title}
                    <EventHoverCard event={event} compact />
                  </button>
                ))}
                {dayEvents.length > visible.length && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day, dayEvents)}
                    className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 transition hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
                  >
                    +{dayEvents.length - visible.length} more
                  </button>
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
        <div key={key} className="rounded-lg border border-brand/10 bg-white p-4 shadow-[0_12px_28px_rgba(90,19,114,0.08)]">
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
    return null;
  }

  const googleMeetUrl = normalizeGoogleMeetUrl(event.meetingUrl);

  return (
    <div className="rounded-[20px] border border-brand/10 bg-white p-4 shadow-[0_18px_44px_rgba(90,19,114,0.14)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <EventBadge label={eventTypeLabel(event.type)} className={typeTone(event.type)} />
            <EventBadge label={prettyStatus(event.status)} className={statusTone(event.status)} />
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{event.title}</h2>
          {event.subtitle && <p className="mt-1 text-sm text-slate-600">{event.subtitle}</p>}
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Scheduled</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{format(eventDate(event.start), "EEE, d MMM - h:mm a")}</div>
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

      {(event.href || googleMeetUrl) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {event.href && (
            <Link
              href={event.href}
              onClick={() => {
                if (googleMeetUrl) window.open(googleMeetUrl, "_blank", "noopener,noreferrer");
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20"
            >
              {event.hrefLabel || "Open"}
            </Link>
          )}
          {googleMeetUrl && (
            <a href={googleMeetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900">
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

function CompactSummary({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
        <Icon size={15} />
      </span>
      <div className="leading-none">
        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
        <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
      </div>
    </div>
  );
}

function EventHoverCard({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-2xl border border-brand/10 bg-white/95 p-3 text-left shadow-[0_16px_40px_rgba(90,19,114,0.18)] backdrop-blur group-hover:xl:block",
        compact && "w-56"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", typeTone(event.type))}>{eventTypeLabel(event.type)}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{format(eventDate(event.start), "h:mm a")}</span>
      </div>
      <div className="mt-2 text-sm font-bold text-slate-950">{event.topic || event.title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{event.coachName ? `Coach ${event.coachName}` : event.subtitle || "Open for full details."}</div>
    </div>
  );
}

function FloatingPanel({
  open,
  title,
  onClose,
  children,
  mobile,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  mobile?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close overlay" onClick={onClose} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" />
      <div
        className={cn(
          "absolute left-1/2 z-10 w-[min(680px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-[24px] bg-white p-3 shadow-[0_28px_80px_rgba(35,25,55,0.28)]",
          mobile ? "bottom-0 left-0 right-0 w-full translate-x-0 rounded-b-none rounded-t-[24px] border-t border-slate-200 p-4" : "top-[8vh] max-h-[84vh] overflow-y-auto"
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">{title}</div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-brand/30 hover:text-brand">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-w-[150px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-brand">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
        <select value={value} onChange={(event) => onChange(event.target.value as T)} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none">
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function EmptyEventPrompt({ visibleEvents }: { visibleEvents: number }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-brand">
        <Eye size={18} />
      </div>
      <h2 className="mt-4 text-lg font-black text-slate-950">Open an event to inspect the details</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">The calendar now keeps the grid clean and opens the coach, batch, and student detail only when you need it.</p>
      <div className="mt-4 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-brand">
        {visibleEvents} visible in this view
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

function StudentEventCard({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const date = eventDate(event.start);
  return (
    <article className={cn("rounded-xl border border-slate-200 bg-white shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md hover:shadow-brand-900/10", compact ? "p-2.5" : "p-3")}>
      <div className={cn("flex gap-3", compact ? "flex-col" : "flex-col sm:flex-row sm:items-start sm:justify-between")}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", studentCalendarTypeTone(event.type))}>
              {studentCalendarTypeLabel(event.type)}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", statusTone(event.status))}>
              {prettyStatus(event.status)}
            </span>
          </div>
          <h3 className={cn("mt-2 line-clamp-2 font-semibold text-slate-950", compact ? "text-xs" : "text-sm")}>{event.title}</h3>
          {event.subtitle && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{event.subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="rounded-lg bg-slate-50 px-2 py-1 font-semibold">{format(date, "h:mm a")}</span>
            {event.durationLabel && !compact && <span className="rounded-lg bg-slate-50 px-2 py-1 font-semibold">{event.durationLabel}</span>}
          </div>
        </div>
        {event.href && !compact && (
          <Link href={event.href} className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-brand px-3 text-sm font-bold text-white shadow-sm shadow-brand/20 transition hover:bg-brand-600">
            {event.hrefLabel || "Open"}
          </Link>
        )}
      </div>
    </article>
  );
}

function StudentCalendarWorkspace({ title, subtitle, events }: { title: string; subtitle: string; events: CalendarEvent[] }) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [view, setView] = useState<"weekly" | "monthly">("weekly");
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
  const monthDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
      }),
    [currentDate]
  );
  const selectedEvents = studentEvents.filter((event) => sameDate(eventDate(event.start), currentDate));
  const upcomingEvents = studentEvents.filter((event) => startOfDay(eventDate(event.start)) >= startOfDay(new Date())).slice(0, 8);
  const classCount = studentEvents.filter((event) => event.type === "class").length;
  const homeworkCount = studentEvents.filter((event) => event.type === "homework").length;
  const tournamentCount = studentEvents.filter((event) => event.type === "tournament").length;
  const visibleDays = view === "weekly" ? weekDays : monthDays;
  const visibleEvents = studentEvents.filter((event) => visibleDays.some((day) => sameDate(eventDate(event.start), day)));
  const rangeLabel = view === "weekly" ? formatRangeLabel("weekly", currentDate) : formatRangeLabel("monthly", currentDate);

  return (
    <div className="space-y-3 text-slate-950">
      <section className="rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand/70">Student Calendar</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:min-w-[380px]">
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">Classes</div>
              <div className="mt-1 text-2xl font-black leading-none text-slate-950">{classCount}</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Homework</div>
              <div className="mt-1 text-2xl font-black leading-none text-slate-950">{homeworkCount}</div>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">Tournaments</div>
              <div className="mt-1 text-2xl font-black leading-none text-slate-950">{tournamentCount}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-brand/10 bg-white p-3 shadow-sm shadow-brand-900/5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCurrentDate(new Date())} className="btn-outline">
              Today
            </button>
            <button type="button" aria-label="Previous range" onClick={() => setCurrentDate((date) => navigateDate(view, date, -1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30">
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label="Next range" onClick={() => setCurrentDate((date) => navigateDate(view, date, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30">
              <ChevronRight size={16} />
            </button>
            <div className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand">
              <CalendarDays size={15} aria-hidden="true" />
              <span className="truncate">{rangeLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {[
                { id: "weekly", label: "Week" },
                { id: "monthly", label: "Month" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id as "weekly" | "monthly")}
                  className={cn(
                    "h-8 rounded-md px-3 text-xs font-bold transition",
                    view === item.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={format(currentDate, "yyyy-MM-dd")}
              onChange={(event) => {
                const next = event.target.value ? new Date(`${event.target.value}T12:00:00`) : new Date();
                if (!Number.isNaN(next.getTime())) setCurrentDate(next);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
            <span className="rounded-lg bg-brand/10 px-3 py-2 text-xs font-bold text-brand">{visibleEvents.length} visible</span>
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-xl border border-brand/10 bg-white p-3 shadow-sm shadow-brand-900/5">
          <div className="hidden md:grid grid-cols-7 border-b border-slate-200 pb-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="px-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{day}</div>
            ))}
          </div>

          <div className={cn("mt-3 grid gap-2", view === "weekly" ? "md:grid-cols-7" : "md:grid-cols-7")}>
            {visibleDays.map((day) => {
              const dayEvents = studentEvents.filter((event) => sameDate(eventDate(event.start), day));
              const active = sameDate(day, currentDate);
              const inCurrentMonth = isSameMonth(day, currentDate);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setCurrentDate(day)}
                  className={cn(
                    "min-h-[96px] rounded-xl border p-2 text-left transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md hover:shadow-brand-900/10 md:min-h-[118px]",
                    view === "weekly" && "xl:min-h-[calc(100dvh-390px)]",
                    active ? "border-brand bg-brand-50 ring-2 ring-brand/10" : "border-slate-200 bg-white",
                    view === "monthly" && !inCurrentMonth && "bg-slate-50/70 text-slate-400"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="md:hidden text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{format(day, "EEE")}</div>
                      <div className={cn("grid h-8 w-8 place-items-center rounded-full text-sm font-bold", isToday(day) ? "bg-brand text-white" : active ? "bg-white text-brand" : "text-slate-700")}>{format(day, "d")}</div>
                    </div>
                    {dayEvents.length > 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{dayEvents.length}</span>}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {dayEvents.slice(0, view === "weekly" ? 4 : 2).map((event) => (
                      <div key={event.id} className={cn("truncate rounded-md border px-2 py-1 text-[11px] font-semibold", studentCalendarTypeTone(event.type))}>
                        {format(eventDate(event.start), "h:mm")} {event.title}
                      </div>
                    ))}
                    {dayEvents.length === 0 && view === "weekly" && <div className="rounded-md bg-slate-50 px-2 py-2 text-center text-[11px] text-slate-400">Free</div>}
                    {dayEvents.length > (view === "weekly" ? 4 : 2) && <div className="text-[11px] font-semibold text-slate-400">+{dayEvents.length - (view === "weekly" ? 4 : 2)} more</div>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:hidden">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{format(currentDate, "EEE")}</div>
                <h2 className="text-lg font-semibold text-slate-950">{format(currentDate, "d MMM")}</h2>
              </div>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{selectedEvents.length} items</span>
            </div>
            <div className="space-y-2">
              {selectedEvents.length ? selectedEvents.map((event) => <StudentEventCard key={event.id} event={event} />) : <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">Nothing scheduled for this day.</p>}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{format(currentDate, "EEE")}</div>
                <h2 className="text-lg font-semibold text-slate-950">{format(currentDate, "d MMM")}</h2>
              </div>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{selectedEvents.length} items</span>
            </div>
            <div className="hidden space-y-2 md:block">
              {selectedEvents.length ? selectedEvents.map((event) => <StudentEventCard key={event.id} event={event} compact />) : <p className="rounded-lg bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">Nothing scheduled for this day.</p>}
            </div>
            <div className="md:hidden text-sm text-slate-500">Tap a day above to review its items.</div>
          </section>

          <section className="rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-950">Upcoming</h2>
              <p className="text-sm text-slate-500">Your next classes, homework, and tournaments.</p>
            </div>
            <div className="space-y-2">
              {upcomingEvents.length ? upcomingEvents.map((event) => (
                <Link key={event.id} href={event.href || "#"} className="block rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-md hover:shadow-brand-900/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", studentCalendarTypeTone(event.type))}>{studentCalendarTypeLabel(event.type)}</span>
                    <span className="text-xs font-bold text-slate-400">{format(eventDate(event.start), "d MMM")}</span>
                  </div>
                  <div className="mt-2 line-clamp-1 text-sm font-semibold text-slate-950">{event.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{format(eventDate(event.start), "h:mm a")}</div>
                </Link>
              )) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">No upcoming items.</div>
              )}
            </div>
          </section>
        </aside>
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
  const [view, setView] = useState<CalendarView>("monthly");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [typeFilter, setTypeFilter] = useState<CalendarType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string>("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMobileSheet, setIsMobileSheet] = useState(false);
  const [overflowDay, setOverflowDay] = useState<{ day: Date; events: CalendarEvent[] } | null>(null);

  useEffect(() => {
    const syncViewport = () => setIsMobileSheet(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

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
      setIsDetailsOpen(false);
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
  const openEvent = (event: CalendarEvent) => {
    setSelectedId(event.id);
    setIsDetailsOpen(true);
  };
  const summaryHomeworkTasks = filteredEvents.filter((event) => event.type === "homework" || event.type === "task" || event.type === "attendance").length;
  const summaryCompetition = filteredEvents.filter((event) => event.type === "tournament" || event.type === "simul").length;
  const shouldUseCompactAdminLayout = role === "admin" || role === "sub-admin";

  return (
    <div className="space-y-3 text-slate-950">
      <section className="rounded-[22px] border border-brand/10 bg-white p-4 shadow-[0_12px_28px_rgba(90,19,114,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">
              {shouldUseCompactAdminLayout ? `${staffLabel} Workspace` : staffLabel}
            </div>
            <h1 className="mt-1 text-2xl font-black text-brand sm:text-3xl">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <CompactSummary label="Today" value={todayEvents} icon={CalendarDays} />
            <CompactSummary label="Upcoming" value={upcomingEvents} icon={Clock3} />
            <CompactSummary label="Completed" value={completedEvents} icon={CheckCircle2} />
          </div>
        </div>
      </section>

      <section className="sticky top-3 z-20 rounded-[22px] border border-brand/10 bg-white/95 p-3 shadow-[0_16px_42px_rgba(90,19,114,0.10)] backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setCurrentDate(new Date())} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm">Today</button>
              <button type="button" onClick={() => setCurrentDate((current) => navigateDate(view, current, -1))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setCurrentDate((current) => navigateDate(view, current, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"><ChevronRight size={16} /></button>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
              <div className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                <CalendarDays size={15} className="shrink-0 text-brand" />
                <span className="truncate">{formatRangeLabel(view, currentDate)}</span>
              </div>
              <div className="overflow-x-auto pb-1 lg:pb-0">
                <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
                  {viewOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setView(item.id)}
                      className={cn(
                        "h-8 shrink-0 rounded-lg px-3 text-xs font-bold whitespace-nowrap transition",
                        view === item.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="hidden text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:inline">Jump</span>
                <input
                  type="date"
                  value={currentDateValue}
                  onChange={(event) => {
                    const next = event.target.value ? new Date(`${event.target.value}T12:00:00`) : new Date();
                    if (!Number.isNaN(next.getTime())) setCurrentDate(next);
                  }}
                  className="h-6 w-[145px] bg-transparent text-sm font-semibold text-slate-900 outline-none"
                />
              </label>
              <div className="hidden shrink-0 rounded-xl bg-brand/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-brand xl:block">
                {visibleEvents.length} visible
              </div>
            </div>
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:items-center">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <LayoutGrid size={12} />
                Legend
              </div>
              <EventLegend />
            </div>
            <FilterSelect icon={<SlidersHorizontal size={14} />} label="Type" value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
            <FilterSelect icon={<Filter size={14} />} label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
            <div className="rounded-xl border border-accent/60 bg-accent/35 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-brand/70">Visible now</div>
              <div className="mt-1 text-sm font-black text-brand">{visibleEvents.length} items</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-3">
          {view === "monthly" && (
            <CalendarMonth
              currentDate={currentDate}
              events={visibleEvents}
              selectedId={selectedId}
              onSelect={openEvent}
              onOpenDay={(day, dayEvents) => setOverflowDay({ day, events: dayEvents })}
            />
          )}

          {view === "weekly" && (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {eachDayOfInterval({
                start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                end: endOfWeek(currentDate, { weekStartsOn: 1 }),
              }).map((day) => (
                <DayEvents key={day.toISOString()} day={day} events={visibleEvents} selectedId={selectedId} onSelect={openEvent} />
              ))}
            </div>
          )}

          {view === "daily" && (
            <div className="space-y-4">
              <DayEvents day={currentDate} events={visibleEvents} selectedId={selectedId} onSelect={openEvent} />
            </div>
          )}

          {view === "agenda" && <CalendarAgenda events={visibleEvents} selectedId={selectedId} onSelect={openEvent} />}

          {!visibleEvents.length && <EmptyState label="No events match your current filters." />}
        </div>

        <div className="space-y-3">
          <EmptyEventPrompt visibleEvents={visibleEvents.length} />

          <div className="rounded-[22px] border border-brand/10 bg-white p-5 shadow-[0_12px_28px_rgba(90,19,114,0.08)]">
            <div className="mb-4 flex items-center gap-2 text-brand">
              <ClipboardCheck size={18} />
              <div className="text-sm font-black uppercase tracking-[0.18em]">At a glance</div>
            </div>
            <div className="grid gap-3">
              <SummaryLine icon={<GraduationCap size={16} />} label="Classes" value={filteredEvents.filter((event) => event.type === "class").length} />
              <SummaryLine icon={<ListTodo size={16} />} label="Homework & tasks" value={summaryHomeworkTasks} />
              <SummaryLine icon={<Trophy size={16} />} label="Tournaments & simuls" value={summaryCompetition} />
              <SummaryLine icon={<Swords size={16} />} label="Active view items" value={visibleEvents.length} />
            </div>
            {(role === "admin" || role === "sub-admin") && (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                Admin and subadmin now review details on demand, which keeps the calendar compact enough to fit at 100% zoom without sacrificing context.
              </div>
            )}
          </div>
        </div>
      </div>

      <FloatingPanel open={isDetailsOpen && !!selectedEvent} title={isMobileSheet ? "Event details" : "Selected event"} onClose={() => setIsDetailsOpen(false)} mobile={isMobileSheet}>
        <EventDetails event={selectedEvent} role={role} />
      </FloatingPanel>

      <FloatingPanel
        open={!!overflowDay}
        title={overflowDay ? `${format(overflowDay.day, "EEE, d MMM")} agenda` : "Daily agenda"}
        onClose={() => setOverflowDay(null)}
        mobile={isMobileSheet}
      >
        <div className="space-y-3">
          {overflowDay?.events.map((event) => (
            <EventChip
              key={event.id}
              event={event}
              active={selectedId === event.id}
              onClick={() => {
                setOverflowDay(null);
                openEvent(event);
              }}
            />
          ))}
        </div>
      </FloatingPanel>
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
