"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { CalendarApi, DatesSetArg, EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminV2Card, AdminV2Modal, AdminV2Stat } from "./AdminV2Primitives";
import { cn } from "@/lib/utils";

type EventType = "class" | "homework" | "tournament" | "task";
type UnifiedCalendarEvent = EventInput & {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  extendedProps: {
    eventType: EventType;
    priority?: "standard" | "high";
    metadata: {
      coach_name?: string;
      batch_name?: string;
      platform_link?: string;
      attendance_status?: "pending" | "completed";
      student_count?: number;
      topic?: string;
      internal_monthly?: boolean;
    };
    action_url: string;
  };
};

const typeOptions: Array<{ value: EventType; label: string }> = [
  { value: "class", label: "Classes" },
  { value: "homework", label: "Homework" },
  { value: "tournament", label: "Tournaments" },
  { value: "task", label: "Tasks" },
];

const viewOptions = [
  { value: "dayGridMonth", label: "Monthly" },
  { value: "timeGridWeek", label: "Weekly" },
  { value: "timeGridDay", label: "Daily" },
  { value: "listWeek", label: "Agenda" },
];

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(value);
}

function eventTypeLabel(type?: string) {
  return typeOptions.find((item) => item.value === type)?.label || "Event";
}

export default function AdminV2UnifiedCalendarClient() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [events, setEvents] = useState<UnifiedCalendarEvent[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<EventType[]>(["class", "homework", "tournament", "task"]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("dayGridMonth");
  const [titleDate, setTitleDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin-v2/calendar", { cache: "no-store" });
    const data = await response.json().catch(() => []);
    if (!response.ok) {
      toast.error(data.error || "Could not load calendar");
      setLoading(false);
      return;
    }
    setEvents(data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter((event) => {
      const props = event.extendedProps;
      const metadata = props.metadata || {};
      if (!selectedTypes.includes(props.eventType)) return false;
      if (!term) return true;
      return [event.title, metadata.coach_name, metadata.batch_name, metadata.topic, props.eventType].filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [events, query, selectedTypes]);

  const stats = {
    total: filteredEvents.length,
    high: filteredEvents.filter((event) => event.extendedProps.priority === "high").length,
    tournaments: filteredEvents.filter((event) => event.extendedProps.eventType === "tournament").length,
  };

  function api(): CalendarApi | null {
    return calendarRef.current?.getApi() || null;
  }

  function move(action: "prev" | "next" | "today") {
    const calendarApi = api();
    if (!calendarApi) return;
    calendarApi[action]();
    setTitleDate(calendarApi.getDate());
  }

  function changeView(nextView: string) {
    setView(nextView);
    api()?.changeView(nextView);
  }

  function onDatesSet(arg: DatesSetArg) {
    setTitleDate(arg.view.currentStart);
  }

  function onEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setSelectedEvent({
      title: info.event.title,
      start: info.event.start,
      end: info.event.end,
      extendedProps: info.event.extendedProps,
    });
  }

  function renderEventContent(eventInfo: EventContentArg) {
    const props: any = eventInfo.event.extendedProps;
    const metadata = props.metadata || {};
    return (
      <div className="group relative w-full min-w-0 cursor-pointer truncate px-1 text-xs">
        <span className="font-black">{eventInfo.timeText}</span> {eventInfo.event.title}
        <div className="pointer-events-none absolute left-0 top-6 z-50 hidden w-72 rounded-md border border-slate-200 bg-white p-3 text-slate-700 shadow-xl group-hover:block">
          <div className="text-sm font-black text-brand">{eventInfo.event.title}</div>
          {metadata.topic ? <div className="mt-2 text-xs">Topic: {metadata.topic}</div> : null}
          {metadata.coach_name ? <div className="mt-1 text-xs">Coach: {metadata.coach_name}</div> : null}
          {metadata.batch_name ? <div className="mt-1 text-xs">Batch: {metadata.batch_name}</div> : null}
          {metadata.platform_link ? <div className="mt-2 text-xs font-bold text-brand">Workspace link available</div> : null}
        </div>
      </div>
    );
  }

  function eventClasses(arg: any) {
    const props = arg.event.extendedProps || {};
    if (props.priority === "high") return ["admin-v2-calendar-event-high"];
    return ["admin-v2-calendar-event-standard"];
  }

  return (
    <div className="space-y-4">
      <AdminV2Card>
        <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex items-center gap-2">
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-brand hover:bg-brand/5" onClick={() => move("prev")}><ChevronLeft size={18} /></button>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-brand hover:bg-brand/5" onClick={() => move("next")}><ChevronRight size={18} /></button>
            <button className="btn-outline h-10" onClick={() => move("today")}>Today</button>
            <div className="ml-2 min-w-48 text-lg font-black text-brand">{formatMonth(titleDate)}</div>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(200px,1fr)_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input className="input h-10 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any part of an event title" />
            </label>
            <div className="relative">
              <button className="btn-outline h-10 w-full md:w-auto" onClick={() => setFiltersOpen((value) => !value)}><Filter size={16} /> Event Types</button>
              {filtersOpen ? (
                <div className="absolute right-0 top-12 z-50 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-xl">
                  {typeOptions.map((item) => (
                    <label key={item.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-brand/5">
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(item.value)}
                        onChange={(event) => setSelectedTypes((current) => event.target.checked ? [...current, item.value] : current.filter((type) => type !== item.value))}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">
            {viewOptions.map((item) => (
              <button key={item.value} className={cn("rounded px-3 py-2 text-xs font-black transition", view === item.value ? "bg-brand text-white" : "text-slate-600 hover:bg-white hover:text-brand")} onClick={() => changeView(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </AdminV2Card>

      <div className="grid gap-3 md:grid-cols-3">
        <AdminV2Stat label="Visible Events" value={stats.total} />
        <AdminV2Stat label="High Priority" value={stats.high} tone="accent" />
        <AdminV2Stat label="Tournaments" value={stats.tournaments} />
      </div>

      <section className="admin-v2-calendar rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        {loading ? (
          <div className="grid min-h-[620px] place-items-center text-sm text-slate-500">Loading calendar...</div>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={false}
            height="auto"
            dayMaxEvents={3}
            events={filteredEvents}
            eventContent={renderEventContent}
            eventClick={onEventClick}
            eventClassNames={eventClasses}
            datesSet={onDatesSet}
            nowIndicator
          />
        )}
      </section>

      <AdminV2Modal open={!!selectedEvent} title={selectedEvent?.title || "Event"} onClose={() => setSelectedEvent(null)} size="sm">
        {selectedEvent ? (
          <div className="space-y-4">
            <Info label="Type" value={eventTypeLabel(selectedEvent.extendedProps?.eventType)} />
            <Info label="Time" value={selectedEvent.start ? selectedEvent.start.toLocaleString("en-IN") : "-"} />
            {selectedEvent.extendedProps?.metadata?.coach_name ? <Info label="Coach" value={selectedEvent.extendedProps.metadata.coach_name} /> : null}
            {selectedEvent.extendedProps?.metadata?.batch_name ? <Info label="Batch" value={selectedEvent.extendedProps.metadata.batch_name} /> : null}
            {selectedEvent.extendedProps?.metadata?.platform_link ? (
              <a href={selectedEvent.extendedProps.metadata.platform_link} target="_blank" className="btn-outline w-full"><ExternalLink size={16} /> Open Workspace</a>
            ) : null}
            <a href={selectedEvent.extendedProps?.action_url || "#"} className="btn-primary w-full"><CalendarDays size={16} /> Manage Full Details</a>
          </div>
        ) : null}
      </AdminV2Modal>

      <style jsx global>{`
        .admin-v2-calendar .fc {
          --fc-border-color: rgba(90, 19, 114, 0.12);
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #ffffff;
          --fc-today-bg-color: rgba(253, 231, 90, 0.18);
          color: #111827;
          font-size: 0.82rem;
        }
        .admin-v2-calendar .fc-scrollgrid,
        .admin-v2-calendar .fc-theme-standard td,
        .admin-v2-calendar .fc-theme-standard th {
          border-color: rgba(90, 19, 114, 0.12);
        }
        .admin-v2-calendar .fc-col-header-cell {
          background: #ffffff;
          color: #5a1372;
          font-weight: 900;
        }
        .admin-v2-calendar .fc-daygrid-day-frame {
          min-height: 108px;
        }
        .admin-v2-calendar .fc-daygrid-more-link {
          color: #5a1372;
          font-weight: 900;
        }
        .admin-v2-calendar-event-standard {
          border: 0 !important;
          background: #5a1372 !important;
          color: #ffffff !important;
          font-weight: 700;
        }
        .admin-v2-calendar-event-high {
          border: 0 !important;
          background: #fde75a !important;
          color: #5a1372 !important;
          font-weight: 900;
        }
      `}</style>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

