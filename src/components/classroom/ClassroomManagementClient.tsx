"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CopyPlus,
  Eye,
  GraduationCap,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  deriveScheduledSessionStatus,
  flattenScheduledSessions,
  formatJoinWindowLabel,
  isJoinWindowOpen,
  isSessionUpcomingLike,
} from "@/lib/classroomSessions";
import JoinScheduledSessionButton from "@/components/classroom/JoinScheduledSessionButton";
import PageLoadingOverlay from "@/components/feedback/PageLoadingOverlay";

type Role = "student" | "instructor" | "admin";

type CourseOption = {
  _id: string;
  name: string;
  category?: string;
  level: "beginner" | "intermediate" | "advanced" | "mixed";
  levels: Array<{ name: string; topics: Array<{ name: string; order?: number }> }>;
};

type StudentOption = { _id: string; name: string; email?: string; username?: string; isActive?: boolean };
type CoachOption = { _id: string; name: string; email?: string; username?: string };
type BatchOption = { _id: string; name: string; level?: string; students: StudentOption[] };

type ClassroomItem = {
  _id: string;
  title: string;
  classroomType: "single" | "series";
  status: "scheduled" | "ongoing" | "completed" | "cancelled";
  courseName?: string;
  levelName?: string;
  topicName?: string;
  classDate?: string;
  startDate?: string;
  startTime?: string;
  durationMinutes?: number;
  coach?: CoachOption | string;
  students?: StudentOption[];
  batches?: Array<BatchOption | string>;
  generatedSessions?: Array<any>;
  meetingProvider?: "meet";
  meetingUrl?: string;
};

type SessionFilterStatus =
  | ""
  | "upcoming"
  | "join_available"
  | "ongoing"
  | "completed"
  | "missed"
  | "cancelled"
  | "rescheduled";

type TargetsPayload = {
  students: StudentOption[];
  coaches: CoachOption[];
  batches: BatchOption[];
  courses: CourseOption[];
};

type CreateMode = "single" | "series";
type EndCondition = "on_date" | "after_n_sessions" | "course_complete" | "never";

function latestSummarySessionId(item: ClassroomItem) {
  const sessions = Array.isArray(item.generatedSessions) ? item.generatedSessions : [];
  if (!sessions.length) return "";
  const preferred = sessions
    .slice()
    .sort((a: any, b: any) => new Date(b.actualEndedAt || b.scheduledFor || 0).getTime() - new Date(a.actualEndedAt || a.scheduledFor || 0).getTime())[0];
  return String(preferred?._id || "");
}

function sessionStatusTone(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "missed") return "bg-amber-50 text-amber-700";
  if (status === "cancelled") return "bg-rose-50 text-rose-700";
  if (status === "rescheduled") return "bg-sky-50 text-sky-700";
  if (status === "ongoing") return "bg-brand/10 text-brand";
  if (status === "join_available") return "bg-violet-50 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

function classroomLifecycleRollup(item: ClassroomItem) {
  const now = new Date();
  const rows = flattenScheduledSessions([item]);
  const counts = rows.reduce((map, row) => {
    const status = deriveScheduledSessionStatus(row.session, now);
    map.set(status, (map.get(status) || 0) + 1);
    return map;
  }, new Map<string, number>());
  return Array.from(counts.entries() as Iterable<[string, number]>).sort((a, b) => b[1] - a[1]);
}

function canJoinScheduledSession(session: any, now = new Date()) {
  const status = deriveScheduledSessionStatus(session, now);
  return status === "join_available" || status === "ongoing" || isJoinWindowOpen(session, now);
}

function dedupeSessionRows(rows: ReturnType<typeof flattenScheduledSessions>) {
  const seen = new Set<string>();
  return rows.filter(({ classroom, session, start }: any) => {
    const sourceId = String(classroom?.sourceSessionId || "");
    const sessionId = String(session?._id || "");
    const classroomId = String(classroom?._id || "");
    const key = sourceId || sessionId || `${classroomId}-${start?.toISOString?.() || ""}-${session?.startTime || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const durationOptions = [
  { value: 15, label: "15 Minutes" },
  { value: 30, label: "30 Minutes" },
  { value: 45, label: "45 Minutes" },
  { value: 60, label: "60 Minutes" },
  { value: 75, label: "1 Hour 15 Minutes" },
  { value: 90, label: "1 Hour 30 Minutes" },
  { value: 105, label: "1 Hour 45 Minutes" },
  { value: 120, label: "2 Hours" },
];

const weekDays = [
  { day: 0, label: "Sunday" },
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
];

function blankForm() {
  return {
    classroomType: "single" as CreateMode,
    title: "",
    course: "",
    courseName: "",
    levelName: "",
    topicName: "",
    topicOrder: 0,
    useCustomTopic: false,
    customTopicName: "",
    classDate: "",
    startTime: "",
    durationMinutes: 60,
    meetingUrl: "",
    startDate: "",
    frequency: "weekly" as "weekly" | "custom",
    sessionsPerWeek: 1,
    daysOfWeek: [{ day: 1, slots: [{ startTime: "16:00", durationMinutes: 60 }] }],
    endCondition: "course_complete" as EndCondition,
    endDate: "",
    endAfterSessions: 20,
    students: [] as string[],
    batches: [] as string[],
    coach: "",
  };
}

export default function ClassroomManagementClient({ role }: { role: Role }) {
  const [items, setItems] = useState<ClassroomItem[]>([]);
  const [targets, setTargets] = useState<TargetsPayload>({ students: [], coaches: [], batches: [], courses: [] });
  const [loading, setLoading] = useState(true);
  const [busyMessage, setBusyMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<ClassroomItem | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(blankForm());
  const [studentSearch, setStudentSearch] = useState("");
  const [coachSearch, setCoachSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filters, setFilters] = useState<{ coach: string; batch: string; student: string; course: string; level: string; status: SessionFilterStatus }>({
    coach: "",
    batch: "",
    student: "",
    course: "",
    level: "",
    status: "",
  });
  const [actionModal, setActionModal] = useState<{ type: string; item: ClassroomItem | null }>({ type: "", item: null });
  const [actionDraft, setActionDraft] = useState<any>({});

  async function withBusy<T>(message: string, task: () => Promise<T>) {
    setBusyMessage(message);
    try {
      return await task();
    } finally {
      setBusyMessage("");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classroomsRes, targetsRes] = await Promise.all([
        fetch("/api/classrooms", { cache: "no-store" }),
        role === "admin" ? fetch("/api/classrooms/targets", { cache: "no-store" }) : Promise.resolve(null as any),
      ]);
      if (classroomsRes.ok) {
        const data = await classroomsRes.json();
        setItems(Array.isArray(data) ? data.map(normalizeClassroomItem) : []);
      }
      if (targetsRes?.ok) setTargets(await targetsRes.json());
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => load();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const selectedCourse = useMemo(() => targets.courses.find((course) => course._id === form.course), [targets.courses, form.course]);
  const selectedLevel = useMemo(
    () => selectedCourse?.levels?.find((level) => level.name === form.levelName) || null,
    [selectedCourse, form.levelName]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.coach && String((item.coach as any)?._id || item.coach || "") !== filters.coach) return false;
      if (filters.course && item.courseName !== filters.course) return false;
      if (filters.level && item.levelName !== filters.level) return false;
      if (filters.status) {
        const itemSessions = flattenScheduledSessions([item]);
        const hasMatchingSession = itemSessions.some((row) => deriveScheduledSessionStatus(row.session, new Date()) === filters.status);
        if (!hasMatchingSession) return false;
      }
      if (filters.student && !(item.students || []).some((student) => student._id === filters.student)) return false;
      if (filters.batch && !(item.batches || []).some((batch: any) => (batch._id || batch) === filters.batch)) return false;
      return true;
    });
  }, [filters, items]);

  const calendarSessions = useMemo(() => {
    return filteredItems.flatMap((item) =>
      (item.generatedSessions || []).map((session: any) => ({
        classroomId: item._id,
        title: item.title,
        topicName: session.topicName,
        scheduledFor: session.scheduledFor,
        startTime: session.startTime,
        status: session.status,
        coachName: (item.coach as any)?.name || "Coach",
      }))
    );
  }, [filteredItems]);

  const filteredAssignableStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return targets.students;
    return targets.students.filter((student) => {
      const batchNames = targets.batches
        .filter((batch) => (batch.students || []).some((item) => item._id === student._id))
        .map((batch) => batch.name)
        .join(" ");
      return [
        student.name,
        student.username,
        student.email,
        batchNames,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    });
  }, [studentSearch, targets.students, targets.batches]);

  const filteredAssignableBatches = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return targets.batches;
    return targets.batches.filter((batch) => {
      return [
        batch.name,
        batch.level,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    });
  }, [studentSearch, targets.batches]);

  const filteredCoaches = useMemo(() => {
    const query = coachSearch.trim().toLowerCase();
    if (!query) return targets.coaches;
    return targets.coaches.filter((coach) =>
      [coach.name, coach.username, coach.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [coachSearch, targets.coaches]);

  function resetModal(mode: CreateMode, item?: ClassroomItem | null) {
    setStudentSearch("");
    setCoachSearch("");
    if (!item) {
      setForm(blankForm());
      setEditItem(null);
      setStep(1);
      setOpen(true);
      setForm((current) => ({ ...current, classroomType: mode }));
      return;
    }
    setEditItem(item);
    setForm({
      classroomType: item.classroomType || mode,
      title: item.title || "",
      course: "",
      courseName: item.courseName || "",
      levelName: item.levelName || "",
      topicName: item.topicName || "",
      topicOrder: 0,
      useCustomTopic: !item.courseName || !item.topicName,
      customTopicName: item.topicName || "",
      classDate: item.classDate ? formatDateInput(item.classDate) : "",
      startTime: item.startTime || "",
      durationMinutes: item.durationMinutes || 60,
      meetingUrl: item.meetingUrl || "",
      startDate: item.startDate ? formatDateInput(item.startDate) : "",
      frequency: "weekly",
      sessionsPerWeek: 1,
      daysOfWeek: normalizeDays(item),
      endCondition: "course_complete",
      endDate: "",
      endAfterSessions: item.generatedSessions?.length || 20,
      students: (item.students || []).map((student) => student._id),
      batches: (item.batches || []).map((batch: any) => batch._id || batch),
      coach: String((item.coach as any)?._id || item.coach || ""),
    });
    setStep(1);
    setOpen(true);
  }

  function updateForm(update: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...update }));
  }

  function setCourse(courseId: string) {
    const course = targets.courses.find((item) => item._id === courseId);
    updateForm({
      course: courseId,
      courseName: course?.name || "",
      levelName: course?.levels?.[0]?.name || "",
      topicName: course?.levels?.[0]?.topics?.[0]?.name || "",
      topicOrder: Number(course?.levels?.[0]?.topics?.[0]?.order || 0),
      useCustomTopic: false,
      customTopicName: "",
    });
  }

  function setLevel(levelName: string) {
    const level = selectedCourse?.levels?.find((item) => item.name === levelName);
    updateForm({
      levelName,
      topicName: level?.topics?.[0]?.name || "",
      topicOrder: Number(level?.topics?.[0]?.order || 0),
    });
  }

  function toggleBatch(batchId: string) {
    const batch = targets.batches.find((item) => item._id === batchId);
    setForm((current) => {
      const active = current.batches.includes(batchId);
      const nextBatches = active ? current.batches.filter((id) => id !== batchId) : [...current.batches, batchId];
      const batchStudentIds = (batch?.students || []).filter((student) => student.isActive !== false).map((student) => student._id);
      const nextStudents = active
        ? current.students.filter((id) => !batchStudentIds.includes(id))
        : Array.from(new Set([...current.students, ...batchStudentIds]));
      return { ...current, batches: nextBatches, students: nextStudents };
    });
  }

  function toggleStudent(studentId: string) {
    setForm((current) => ({
      ...current,
      students: current.students.includes(studentId) ? current.students.filter((id) => id !== studentId) : [...current.students, studentId],
    }));
  }

  function updateDay(day: number, slots: Array<{ startTime: string; durationMinutes: number }>) {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.some((item) => item.day === day)
        ? current.daysOfWeek.map((item) => (item.day === day ? { ...item, slots } : item))
        : [...current.daysOfWeek, { day, slots }],
    }));
  }

  async function submitForm() {
    await withBusy(editItem ? "Updating classroom..." : "Creating classroom...", async () => {
      const reviewTopicName = form.useCustomTopic ? form.customTopicName : form.topicName;
      const sessionPlan =
        form.classroomType === "single"
          ? [{
              sessionNumber: 1,
              topicName: reviewTopicName || form.title || "Session 1",
              topicOrder: Number(form.topicOrder || 0),
            }]
          : (selectedLevel?.topics || []).map((topic, index) => ({
              sessionNumber: index + 1,
              topicName: topic.name,
              topicOrder: Number(topic.order ?? index),
            }));

      const payload = {
        ...form,
        topicName: reviewTopicName,
        meetingProvider: "meet",
        sessionPlan,
      };
      const url = editItem ? `/api/classrooms/${editItem._id}` : "/api/classrooms";
      const method = editItem ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Could not save classroom");
        return;
      }
      toast.success(editItem ? "Classroom updated" : "Classroom created");
      setOpen(false);
      setEditItem(null);
      setForm(blankForm());
      await load();
    });
  }

  async function runAction() {
    if (!actionModal.item) return;
    await withBusy("Updating classroom...", async () => {
      const response = await fetch(`/api/classrooms/${actionModal.item!._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionModal.type, ...actionDraft }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Could not update class");
        return;
      }
      toast.success("Class updated");
      setActionModal({ type: "", item: null });
      setActionDraft({});
      await load();
    });
  }

  async function deleteItem(item: ClassroomItem) {
    if (!window.confirm(`Delete ${item.title}?`)) return;
    await withBusy("Deleting classroom...", async () => {
      const response = await fetch(`/api/classrooms/${item._id}`, { method: "DELETE" });
      if (!response.ok) return toast.error("Could not delete class");
      toast.success("Class deleted");
      await load();
    });
  }

  if (role !== "admin") {
    return <SimpleClassroomList items={items} loading={loading} role={role} />;
  }

  return (
    <>
    <PageLoadingOverlay visible={!!busyMessage} message={busyMessage} />
    <div className="min-h-full space-y-4 text-slate-950">
      <div className="flex flex-none flex-col gap-3 rounded-lg border border-brand/10 bg-white px-4 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brand">
            <GraduationCap size={14} />
            Classroom Management
          </div>
          <h1 className="mt-1 text-2xl font-black text-brand">Classes</h1>
          <p className="text-sm text-slate-600">Create one-off classes and recurring learning series from one scheduling hub.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => resetModal("single")}>
            <Plus size={15} /> Single Class
          </button>
          <button className="btn-primary" onClick={() => resetModal("series")}>
            <CalendarDays size={15} /> Learning Series
          </button>
        </div>
      </div>

      <div className="grid flex-none gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-[repeat(6,minmax(0,1fr))]">
        <FilterSelect label="Coach" value={filters.coach} onChange={(value) => setFilters((current) => ({ ...current, coach: value }))} options={targets.coaches.map((coach) => ({ value: coach._id, label: coach.name }))} />
        <FilterSelect label="Batch" value={filters.batch} onChange={(value) => setFilters((current) => ({ ...current, batch: value }))} options={targets.batches.map((batch) => ({ value: batch._id, label: batch.name }))} />
        <FilterSelect label="Student" value={filters.student} onChange={(value) => setFilters((current) => ({ ...current, student: value }))} options={targets.students.map((student) => ({ value: student._id, label: student.name }))} />
        <FilterSelect label="Course" value={filters.course} onChange={(value) => setFilters((current) => ({ ...current, course: value }))} options={uniqueOptions(items.map((item) => item.courseName).filter(Boolean) as string[])} />
        <FilterSelect label="Level" value={filters.level} onChange={(value) => setFilters((current) => ({ ...current, level: value }))} options={uniqueOptions(items.map((item) => item.levelName).filter(Boolean) as string[])} />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(value) => setFilters((current) => ({ ...current, status: value as SessionFilterStatus }))}
          options={["upcoming", "join_available", "ongoing", "completed", "missed", "cancelled", "rescheduled"].map((value) => ({ value, label: titleCase(value) }))}
        />
      </div>

      <div className="inline-flex w-fit flex-none rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button className={cn("rounded-md px-3 py-2 text-sm font-semibold transition", view === "list" ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-50")} onClick={() => setView("list")}>List</button>
        <button className={cn("rounded-md px-3 py-2 text-sm font-semibold transition", view === "calendar" ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-50")} onClick={() => setView("calendar")}>Calendar</button>
      </div>

      <div className="rounded-lg border border-brand/10 bg-white shadow-xl shadow-brand/5">
        {view === "list" ? (
          <div className="p-4">
            {loading ? (
              <div className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Loading classes...</div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No classes match the current filters.</div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => {
                  const summarySessionId = latestSummarySessionId(item);
                  const summaryHref = summarySessionId ? `/classrooms/${item._id}/summary?session=${summarySessionId}` : `/classrooms/${item._id}/summary`;
                  const lifecycleRollup = classroomLifecycleRollup(item);
                  const timingLabel = item.classroomType === "single"
                    ? `${formatDate(item.classDate)} at ${item.startTime || "--"} for ${formatDuration(item.durationMinutes || 60)}`
                    : `${item.generatedSessions?.length || 0} scheduled sessions ? starts ${formatDate(item.startDate)}`;
                  return (
                    <div key={item._id} className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="min-w-0">
                            <div className="text-lg font-black text-slate-950">{item.title}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-brand/10 px-2.5 py-1 font-bold text-brand">{item.classroomType === "single" ? "Single Class" : "Learning Series"}</span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{titleCase(item.status)}</span>
                              {item.courseName && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">{item.courseName}</span>}
                              {item.levelName && <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">{item.levelName}</span>}
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.2fr)_repeat(4,minmax(110px,auto))]">
                            <CompactInfo label="Topic" value={item.topicName || "Not set"} />
                            <CompactInfo label="Coach" value={(item.coach as any)?.name || "Unassigned"} />
                            <CompactInfo label="Students" value={String(item.students?.length || 0)} />
                            <CompactInfo label="Meeting" value={item.meetingUrl ? "Ready" : "Not added"} />
                            <CompactInfo label="Schedule" value={timingLabel} />
                          </div>

                          {lifecycleRollup.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Session Lifecycle</span>
                              {lifecycleRollup.map(([status, count]) => (
                                <span key={`${item._id}-${status}`} className={`rounded-full px-2.5 py-1 text-xs font-bold ${sessionStatusTone(status)}`}>
                                  {count} {titleCase(status)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-none flex-col gap-3 xl:min-w-[220px] xl:items-end">
                          <div className="flex justify-start gap-1 xl:justify-end">
                            <Link href={summaryHref} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700"><Eye size={15} /></Link>
                            <button onClick={() => resetModal(item.classroomType, item)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700"><Pencil size={15} /></button>
                            <button onClick={() => deleteItem(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600"><Trash2 size={15} /></button>
                          </div>

                          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                            <ActionButton icon={<Clock3 size={14} />} label="Reschedule" onClick={() => { setActionModal({ type: "reschedule_class", item }); setActionDraft({ classDate: item.classDate ? formatDateInput(item.classDate) : "", startTime: item.startTime || "", durationMinutes: item.durationMinutes || 60 }); }} />
                            <ActionButton icon={<X size={14} />} label="Cancel" onClick={() => { setActionModal({ type: "cancel_class", item }); setActionDraft({}); }} />
                            <ActionButton icon={<UserCog size={14} />} label="Substitute Coach" onClick={() => { setActionModal({ type: "substitute_coach", item }); setActionDraft({ scope: item.classroomType === "series" ? "future" : "entire", coach: "" }); }} />
                            {item.classroomType === "series" && <ActionButton icon={<CopyPlus size={14} />} label="Add Extra Class" onClick={() => { setActionModal({ type: "add_extra_class", item }); setActionDraft({ topicName: "", classDate: "", startTime: item.startTime || "16:00", durationMinutes: item.durationMinutes || 60 }); }} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <CalendarView sessions={calendarSessions} />
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">{form.classroomType === "single" ? "Single Class" : "Learning Series"}</div>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{editItem ? "Edit Classroom" : "Create Classroom"}</h2>
                <p className="text-sm text-slate-500">Step {step} of 4</p>
              </div>
              <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600"><X size={18} /></button>
            </div>

            <div className="flex flex-none gap-2 px-5 py-3">
              {[1, 2, 3, 4].map((index) => (
                <button key={index} onClick={() => setStep(index)} className={cn("flex-1 rounded-full px-3 py-2 text-sm font-bold", step === index ? "bg-brand text-white" : "bg-slate-100 text-slate-500")}>
                  {index === 1 ? "Class Info" : index === 2 ? "Students" : index === 3 ? "Coach" : "Review"}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              {step === 1 && (
                <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-4">
                    <Field label="Class Name">
                      <input className="input h-10" value={form.title} onChange={(event) => updateForm({ title: event.target.value })} placeholder="e.g. Beginner Thursday Batch" />
                    </Field>
                    <Field label="Course">
                      <select className="input h-10" value={form.course} onChange={(event) => setCourse(event.target.value)}>
                        <option value="">Not linked to a course</option>
                        {targets.courses.map((course) => <option key={course._id} value={course._id}>{course.name}</option>)}
                      </select>
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Level">
                        <select className="input h-10" value={form.levelName} onChange={(event) => setLevel(event.target.value)}>
                          <option value="">Select level</option>
                          {(selectedCourse?.levels || []).map((level) => <option key={level.name} value={level.name}>{level.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Topic">
                        <select className="input h-10" value={form.topicName} onChange={(event) => updateForm({ topicName: event.target.value })} disabled={form.useCustomTopic}>
                          <option value="">Select topic</option>
                          {(selectedLevel?.topics || []).map((topic) => <option key={topic.name} value={topic.name}>{topic.name}</option>)}
                        </select>
                      </Field>
                    </div>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={form.useCustomTopic} onChange={(event) => updateForm({ useCustomTopic: event.target.checked, customTopicName: event.target.checked ? form.customTopicName : "" })} />
                      Custom Topic
                    </label>
                    {form.useCustomTopic && (
                      <Field label="Custom Topic Name">
                        <input className="input h-10" value={form.customTopicName} onChange={(event) => updateForm({ customTopicName: event.target.value })} placeholder="Enter custom topic name" />
                      </Field>
                    )}
                  </div>

                  <div className="space-y-4">
                    {form.classroomType === "single" ? (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Class Date">
                            <input type="date" className="input h-10" value={form.classDate} onChange={(event) => updateForm({ classDate: event.target.value })} />
                          </Field>
                          <Field label="Start Time">
                            <input type="time" className="input h-10" value={form.startTime} onChange={(event) => updateForm({ startTime: event.target.value })} />
                          </Field>
                        </div>
                        <Field label="Duration">
                          <select className="input h-10" value={form.durationMinutes} onChange={(event) => updateForm({ durationMinutes: Number(event.target.value) })}>
                            {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </Field>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Start Date">
                            <input type="date" className="input h-10" value={form.startDate} onChange={(event) => updateForm({ startDate: event.target.value })} />
                          </Field>
                          <Field label="Frequency">
                            <select className="input h-10" value={form.frequency} onChange={(event) => updateForm({ frequency: event.target.value as "weekly" | "custom" })}>
                              <option value="weekly">Weekly</option>
                              <option value="custom">Custom</option>
                            </select>
                          </Field>
                        </div>
                        <Field label="Sessions Per Week">
                          <select className="input h-10" value={form.sessionsPerWeek} onChange={(event) => updateForm({ sessionsPerWeek: Number(event.target.value) })}>
                            {[1, 2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{count} Session{count > 1 ? "s" : ""}</option>)}
                          </select>
                        </Field>
                        <SeriesScheduleEditor form={form} updateForm={updateForm} updateDay={updateDay} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="End Condition">
                            <select className="input h-10" value={form.endCondition} onChange={(event) => updateForm({ endCondition: event.target.value as EndCondition })}>
                              <option value="on_date">End on Specific Date</option>
                              <option value="after_n_sessions">End After Number of Sessions</option>
                              <option value="course_complete">End When Course is Completed</option>
                              <option value="never">Never End</option>
                            </select>
                          </Field>
                          {form.endCondition === "on_date" ? (
                            <Field label="End Date">
                              <input type="date" className="input h-10" value={form.endDate} onChange={(event) => updateForm({ endDate: event.target.value })} />
                            </Field>
                          ) : form.endCondition === "after_n_sessions" ? (
                            <Field label="Sessions">
                              <input type="number" className="input h-10" min={1} value={form.endAfterSessions} onChange={(event) => updateForm({ endAfterSessions: Number(event.target.value || 1) })} />
                            </Field>
                          ) : (
                            <Field label="Duration">
                              <select className="input h-10" value={form.durationMinutes} onChange={(event) => updateForm({ durationMinutes: Number(event.target.value) })}>
                                {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </Field>
                          )}
                        </div>
                      </>
                    )}
                    <Field label="Meeting URL">
                      <input className="input h-10" value={form.meetingUrl} onChange={(event) => updateForm({ meetingUrl: event.target.value })} placeholder="https://meet.google.com/..." />
                    </Field>
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Students and coaches will only see a meeting button. The raw URL stays hidden.</p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="relative">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        className="input h-10 pl-9"
                        value={studentSearch}
                        onChange={(event) => setStudentSearch(event.target.value)}
                        placeholder="Search name, student ID, email, or batch"
                      />
                    </div>
                    <div className="text-sm font-black text-slate-950">Batch Assignment</div>
                    {filteredAssignableBatches.map((batch) => (
                      <label key={batch._id} className="flex items-start gap-3 rounded-xl border border-white bg-white p-3 shadow-sm">
                        <input type="checkbox" checked={form.batches.includes(batch._id)} onChange={() => toggleBatch(batch._id)} />
                        <span>
                          <div className="font-semibold text-slate-900">{batch.name}</div>
                          <div className="text-xs text-slate-500">{(batch.students || []).filter((student) => student.isActive !== false).length} active students</div>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-black text-slate-950">Students</div>
                        <div className="text-xs text-slate-500">Batch picks auto-select students. Search works across name, student ID, email, and batch.</div>
                      </div>
                      <div className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{form.students.length} selected</div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {filteredAssignableStudents.map((student) => (
                        <label key={student._id} className={cn("flex items-start gap-3 rounded-xl border p-3 shadow-sm transition", form.students.includes(student._id) ? "border-brand bg-brand/5" : "border-slate-200 bg-slate-50")}>
                          <input type="checkbox" checked={form.students.includes(student._id)} onChange={() => toggleStudent(student._id)} />
                          <span className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{student.name}</div>
                            <div className="truncate text-xs text-slate-500">{student.username || student.email}</div>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="max-w-3xl space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 text-sm font-black text-slate-950">Coach Assignment</div>
                    <div className="relative mb-3">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        className="input h-10 pl-9"
                        value={coachSearch}
                        onChange={(event) => setCoachSearch(event.target.value)}
                        placeholder="Search coach by name, ID, or email"
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {filteredCoaches.map((coach) => (
                        <button key={coach._id} type="button" onClick={() => updateForm({ coach: coach._id })} className={cn("rounded-xl border p-4 text-left shadow-sm transition", form.coach === coach._id ? "border-brand bg-brand/10" : "border-slate-200 bg-white")}>
                          <div className="font-semibold text-slate-950">{coach.name}</div>
                          <div className="text-xs text-slate-500">{coach.username || coach.email}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-lg font-black text-slate-950">{form.title || "Untitled Class"}</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <ReviewRow label="Course" value={form.courseName || "Not linked"} />
                      <ReviewRow label="Level" value={form.levelName || "Not set"} />
                      <ReviewRow label="Topic" value={form.useCustomTopic ? form.customTopicName : form.topicName || "Not set"} />
                      <ReviewRow label="Coach" value={targets.coaches.find((coach) => coach._id === form.coach)?.name || "Not assigned"} />
                      <ReviewRow label="Students" value={`${form.students.length} selected`} />
                      <ReviewRow label="Meeting" value={form.meetingUrl ? "Meeting ready" : "Not added"} />
                      <ReviewRow label="Duration" value={formatDuration(form.durationMinutes)} />
                      <ReviewRow label="Type" value={form.classroomType === "single" ? "Single Class" : "Learning Series"} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-black text-slate-950">Schedule Preview</div>
                    {form.classroomType === "single" ? (
                      <div className="mt-3 rounded-xl border border-white bg-white p-3 text-sm text-slate-700">
                        {form.classDate || "--"} at {form.startTime || "--"}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {(selectedLevel?.topics || []).map((topic, index) => (
                          <div key={topic.name} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-700">
                            Session {index + 1}: {topic.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
              <button onClick={() => setStep((current) => Math.max(1, current - 1))} className="btn-outline" disabled={step === 1}>
                <ChevronLeft size={15} /> Previous
              </button>
              {step < 4 ? (
                <button onClick={() => setStep((current) => Math.min(4, current + 1))} className="btn-primary">
                  Next <ChevronRight size={15} />
                </button>
              ) : (
                <button onClick={submitForm} className="btn-primary">Confirm and Create</button>
              )}
            </div>
          </div>
        </div>
      )}

      {actionModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-lg font-black text-slate-950">{actionTitle(actionModal.type)}</div>
                <div className="text-sm text-slate-500">{actionModal.item.title}</div>
              </div>
              <button onClick={() => setActionModal({ type: "", item: null })} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {actionModal.type === "reschedule_class" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Date"><input type="date" className="input h-10" value={actionDraft.classDate || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, classDate: event.target.value }))} /></Field>
                  <Field label="Time"><input type="time" className="input h-10" value={actionDraft.startTime || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, startTime: event.target.value }))} /></Field>
                  <Field label="Duration"><select className="input h-10" value={actionDraft.durationMinutes || 60} onChange={(event) => setActionDraft((current: any) => ({ ...current, durationMinutes: Number(event.target.value) }))}>{durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                </div>
              )}
              {actionModal.type === "substitute_coach" && (
                <>
                  <Field label="Scope">
                    <select className="input h-10" value={actionDraft.scope || "entire"} onChange={(event) => setActionDraft((current: any) => ({ ...current, scope: event.target.value }))}>
                      {actionModal.item.classroomType === "series" && <option value="session">One Session</option>}
                      {actionModal.item.classroomType === "series" && <option value="future">Future Sessions</option>}
                      <option value="entire">Entire {actionModal.item.classroomType === "series" ? "Series" : "Class"}</option>
                    </select>
                  </Field>
                  <Field label="Coach">
                    <select className="input h-10" value={actionDraft.coach || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, coach: event.target.value }))}>
                      <option value="">Select coach</option>
                      {targets.coaches.map((coach) => <option key={coach._id} value={coach._id}>{coach.name}</option>)}
                    </select>
                  </Field>
                </>
              )}
              {actionModal.type === "add_extra_class" && (
                <div className="grid gap-4">
                  <Field label="Topic"><input className="input h-10" value={actionDraft.topicName || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, topicName: event.target.value }))} /></Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Date"><input type="date" className="input h-10" value={actionDraft.classDate || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, classDate: event.target.value }))} /></Field>
                    <Field label="Time"><input type="time" className="input h-10" value={actionDraft.startTime || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, startTime: event.target.value }))} /></Field>
                    <Field label="Duration"><select className="input h-10" value={actionDraft.durationMinutes || 60} onChange={(event) => setActionDraft((current: any) => ({ ...current, durationMinutes: Number(event.target.value) }))}>{durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                  </div>
                </div>
              )}
              {actionModal.type === "cancel_class" && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">This will cancel the selected class without deleting its record.</div>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setActionModal({ type: "", item: null })} className="btn-outline">Close</button>
              <button onClick={runAction} className="btn-primary">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-bold text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900" title={value}>{value}</div>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm">
      {icon}
      {label}
    </button>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <select className="mt-1 w-full bg-transparent text-sm text-slate-900 outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function SeriesScheduleEditor({
  form,
  updateForm,
  updateDay,
}: {
  form: ReturnType<typeof blankForm>;
  updateForm: (update: Partial<ReturnType<typeof blankForm>>) => void;
  updateDay: (day: number, slots: Array<{ startTime: string; durationMinutes: number }>) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-sm font-black text-slate-950">Days and Time Slots</div>
      <div className="space-y-3">
        {weekDays.map((weekDay) => {
          const dayEntry = form.daysOfWeek.find((item) => item.day === weekDay.day) || { day: weekDay.day, slots: [] as Array<{ startTime: string; durationMinutes: number }> };
          return (
            <div key={weekDay.day} className="rounded-xl border border-white bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">{weekDay.label}</div>
                <button
                  type="button"
                  onClick={() => updateDay(weekDay.day, [...dayEntry.slots, { startTime: "16:00", durationMinutes: form.durationMinutes }])}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700"
                >
                  <Plus size={12} /> Add Slot
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {dayEntry.slots.length === 0 ? (
                  <div className="text-xs text-slate-400">No slots selected.</div>
                ) : (
                  dayEntry.slots.map((slot, slotIndex) => (
                    <div key={`${weekDay.day}-${slotIndex}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_36px]">
                      <input type="time" className="input h-9" value={slot.startTime} onChange={(event) => updateDay(weekDay.day, dayEntry.slots.map((item, index) => index === slotIndex ? { ...item, startTime: event.target.value } : item))} />
                      <select className="input h-9" value={slot.durationMinutes} onChange={(event) => updateDay(weekDay.day, dayEntry.slots.map((item, index) => index === slotIndex ? { ...item, durationMinutes: Number(event.target.value) } : item))}>
                        {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <button type="button" onClick={() => updateDay(weekDay.day, dayEntry.slots.filter((_, index) => index !== slotIndex))} className="grid h-9 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-600"><Trash2 size={14} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarView({ sessions }: { sessions: Array<{ title: string; topicName: string; scheduledFor: string; startTime: string; status: string; coachName: string }> }) {
  const grouped = sessions
    .slice()
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
    .reduce((map, session) => {
      const key = formatDate(session.scheduledFor);
      if (!map[key]) map[key] = [];
      map[key].push(session);
      return map;
    }, {} as Record<string, typeof sessions>);

  return (
    <div className="min-h-0 overflow-auto p-4">
      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No sessions in the current view.</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, rows]) => (
            <div key={date} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-black text-slate-950">{date}</div>
              <div className="space-y-2">
                {rows.map((row, index) => (
                  <div key={`${date}-${index}`} className="grid gap-2 rounded-xl bg-slate-50 px-3 py-2 md:grid-cols-[100px_1fr_1fr_120px]">
                    <div className="font-semibold text-slate-800">{row.startTime}</div>
                    <div className="font-semibold text-slate-900">{row.title}</div>
                    <div className="text-slate-600">{row.topicName}</div>
                    <div className="text-slate-500">{row.coachName}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleClassroomList({ items, loading, role }: { items: ClassroomItem[]; loading: boolean; role: Role }) {
  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading classrooms...</div>;
  const now = new Date();
  const sessions = dedupeSessionRows(flattenScheduledSessions(items)
    .filter((row) => row.start)
    .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0)));
  const upcoming = sessions.filter((row) => isSessionUpcomingLike(deriveScheduledSessionStatus(row.session, now))).slice(0, 12);
  const history = sessions
    .filter((row) => {
      const status = deriveScheduledSessionStatus(row.session, now);
      return ["completed", "missed", "cancelled", "rescheduled"].includes(status);
    })
    .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0))
    .slice(0, 12);
  const currentRoleLabel = role === "student" ? "Coach" : "Batch / Students";
  const pageTitle = role === "student" ? "My Classes" : "Teaching Schedule";
  const pageSubtitle = role === "student" ? "Join classes only through your scheduled sessions." : "Upcoming sessions, completed class records, and classroom entry points.";
  const statusTone = (status: string) => {
    if (status === "completed") return "bg-emerald-50 text-emerald-700";
    if (status === "missed") return "bg-amber-50 text-amber-700";
    if (status === "cancelled") return "bg-rose-50 text-rose-700";
    if (status === "rescheduled") return "bg-sky-50 text-sky-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="space-y-4 text-slate-950">
      <div className="rounded-lg border border-brand/10 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brand">
            <GraduationCap size={14} />
            {role === "student" ? "Classroom" : "Classroom Management"}
          </div>
          <h1 className="mt-1 text-2xl font-black text-brand">{pageTitle}</h1>
          <p className="text-sm text-slate-600">{pageSubtitle}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniMetric label="Upcoming" value={upcoming.length} />
          <MiniMetric label="Completed" value={history.filter((row) => deriveScheduledSessionStatus(row.session, now) === "completed").length} />
          <MiniMetric label="Closed" value={history.length} />
        </div>
      </div>
      </div>

      <div className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">{role === "student" ? "Upcoming Classes" : "Upcoming Teaching Sessions"}</h2>
          <p className="text-xs text-slate-500">Only live, joinable, and future sessions appear here.</p>
        </div>
      </div>
      {upcoming.length === 0 ? (
        <div className="card text-sm text-slate-500">No scheduled sessions right now.</div>
      ) : (
        <div className="space-y-2">
          {upcoming.map(({ classroom, session }) => {
            const status = deriveScheduledSessionStatus(session, now);
            const joinOpen = canJoinScheduledSession(session, now);
            const summaryHref = `/classrooms/${classroom._id}/summary?session=${String(session._id)}`;
            return (
              <div key={`${classroom._id}-${session._id}`} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-black text-slate-950">{classroom.title}</h3>
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", sessionStatusTone(status))}>{formatJoinWindowLabel(session, now)}</span>
                      {classroom.courseName && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">{classroom.courseName}</span>}
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
                      <CompactInfo label="Topic" value={session.topicName || classroom.topicName || "Not set"} />
                      <CompactInfo label={currentRoleLabel} value={role === "student" ? ((classroom.coach as any)?.name || "Coach") : ((classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} assigned`)} />
                      <CompactInfo label="When" value={`${formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} at ${session.startTime || classroom.startTime || "--"}`} />
                      <CompactInfo label="Duration" value={formatDuration(session.durationMinutes || classroom.durationMinutes || 60)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <JoinScheduledSessionButton
                      classroomId={String(classroom._id)}
                      sessionId={String(session._id)}
                      meetingUrl={classroom.meetingUrl}
                      className={joinOpen ? "btn-primary" : "btn-outline"}
                      label="Join Classroom"
                      disabled={!joinOpen}
                    />
                    <Link href={summaryHref} className="btn-outline">View Details</Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <div className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-2xl font-black text-slate-950">{role === "student" ? "Class History" : "Completed Sessions"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {role === "student"
              ? "Review closed classes, attendance, and your session summaries."
              : "Open finished class summaries, attendance, and teaching records."}
          </p>
        </div>
        {history.length === 0 ? (
          <div className="card text-sm text-slate-500">Completed sessions will appear here after class ends.</div>
        ) : (
          <div className="space-y-2">
            {history.map(({ classroom, session }) => {
              const status = deriveScheduledSessionStatus(session, now);
              const summaryHref = `/classrooms/${classroom._id}/summary?session=${String(session._id)}`;
              return (
                <div key={`history-${classroom._id}-${session._id}`} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-black text-slate-950">{classroom.title}</h3>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", statusTone(status))}>{formatJoinWindowLabel(session, now)}</span>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
                        <CompactInfo label="Topic" value={session.topicName || classroom.topicName || "Not set"} />
                        <CompactInfo label={currentRoleLabel} value={role === "student" ? ((classroom.coach as any)?.name || "Coach") : ((classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} assigned`)} />
                        <CompactInfo label="When" value={`${formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} at ${session.startTime || classroom.startTime || "--"}`} />
                        <CompactInfo label="Duration" value={formatDuration(session.durationMinutes || classroom.durationMinutes || 60)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Link href={summaryHref} className="btn-primary">View Details</Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-slate-50 px-3 py-3 text-right">
      <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-brand sm:text-2xl">{value}</div>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).map((value) => ({ value, label: value }));
}

function normalizeClassroomItem(item: any): ClassroomItem {
  return {
    _id: String(item?._id || ""),
    title: String(item?.title || "Untitled classroom"),
    classroomType: item?.classroomType === "series" ? "series" : "single",
    status: item?.status === "ongoing" || item?.status === "completed" || item?.status === "cancelled" ? item.status : "scheduled",
    courseName: item?.courseName ? String(item.courseName) : "",
    levelName: item?.levelName ? String(item.levelName) : "",
    topicName: item?.topicName ? String(item.topicName) : "",
    classDate: item?.classDate || undefined,
    startDate: item?.startDate || undefined,
    startTime: item?.startTime ? String(item.startTime) : "",
    durationMinutes: Number(item?.durationMinutes || 60),
    coach: item?.coach || "",
    students: Array.isArray(item?.students) ? item.students : [],
    batches: Array.isArray(item?.batches) ? item.batches : [],
    generatedSessions: Array.isArray(item?.generatedSessions) ? item.generatedSessions : [],
    meetingProvider: item?.meetingProvider === "meet" ? "meet" : undefined,
    meetingUrl: item?.meetingUrl ? String(item.meetingUrl) : "",
  };
}

function titleCase(value?: string | null) {
  if (!value) return "Not set";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeDays(item: ClassroomItem) {
  const raw = Array.isArray((item as any).daysOfWeek) ? (item as any).daysOfWeek : [];
  return raw.length ? raw : [{ day: 1, slots: [{ startTime: item.startTime || "16:00", durationMinutes: item.durationMinutes || 60 }] }];
}

function actionTitle(type: string) {
  if (type === "reschedule_class") return "Reschedule Class";
  if (type === "cancel_class") return "Cancel Class";
  if (type === "substitute_coach") return "Substitute Coach";
  if (type === "add_extra_class") return "Add Extra Class";
  return "Update Class";
}
