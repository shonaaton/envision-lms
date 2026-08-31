"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CopyPlus,
  Eye,
  GraduationCap,
  ArrowLeft,
  Link2,
  ListChecks,
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
import { useRouter } from "next/navigation";
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

type Role = "student" | "instructor" | "admin" | "sub-admin";

type ClassroomPermissions = {
  view: boolean;
  join: boolean;
  create: boolean;
  edit: boolean;
  cancel: boolean;
  assign: boolean;
  attendance: boolean;
};

type GroupFocus = {
  id: string;
  name: string;
  level?: string;
  students?: StudentOption[];
};

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
  course?: { _id?: string } | string;
  levelName?: string;
  topicName?: string;
  classDate?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  durationMinutes?: number;
  frequency?: "weekly" | "custom";
  sessionsPerWeek?: number;
  daysOfWeek?: Array<{ day: number; slots: Array<{ startTime: string; durationMinutes: number }> }>;
  endCondition?: EndCondition;
  endAfterSessions?: number;
  seriesTopicMode?: SeriesTopicMode;
  sessionPlan?: Array<{ sessionNumber: number; topicName: string; topicOrder?: number }>;
  coach?: CoachOption | string;
  students?: StudentOption[];
  batches?: Array<BatchOption | string>;
  generatedSessions?: Array<any>;
  meetingProvider?: "meet";
  meetingUrl?: string;
  isTestClassroom?: boolean;
};

type SessionFilterStatus =
  | ""
  | "upcoming"
  | "join_available"
  | "ongoing"
  | "completed"
  | "missed"
  | "cancelled"
  | "rescheduled"
  | "abandoned"
  | "coach_no_show"
  | "student_no_show"
  | "technical_issue";

type TargetsPayload = {
  students: StudentOption[];
  coaches: CoachOption[];
  batches: BatchOption[];
  courses: CourseOption[];
};

type CreateMode = "single" | "series";
type SeriesTopicMode = "all" | "selected";
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
  if (status === "abandoned") return "bg-amber-50 text-amber-700";
  if (status === "coach_no_show") return "bg-red-50 text-red-700";
  if (status === "student_no_show") return "bg-orange-50 text-orange-700";
  if (status === "technical_issue") return "bg-slate-100 text-slate-700";
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

function assignedCoachName(classroom: ClassroomItem, scheduledSession?: any) {
  const substitute = scheduledSession?.substituteCoach;
  if (substitute && typeof substitute === "object" && substitute.name) return substitute.name;
  const coach = classroom.coach;
  return coach && typeof coach === "object" ? coach.name || "Coach" : "Coach";
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
    seriesTopicMode: "all" as SeriesTopicMode,
    classCount: 1,
    selectedTopicNames: [] as string[],
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

export default function ClassroomManagementClient({
  role,
  isSuperAdmin = false,
  permissions,
  groupFocus,
}: {
  role: Role;
  isSuperAdmin?: boolean;
  permissions: ClassroomPermissions;
  groupFocus?: GroupFocus;
}) {
  const router = useRouter();
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
  const [filters, setFilters] = useState<{ coach: string; batch: string; student: string; course: string; level: string; status: SessionFilterStatus }>({
    coach: "",
    batch: groupFocus?.id || "",
    student: "",
    course: "",
    level: "",
    status: "",
  });
  const [actionModal, setActionModal] = useState<{ type: string; item: ClassroomItem | null; session?: any }>({ type: "", item: null });
  const [actionDraft, setActionDraft] = useState<any>({});
  const lastLoadErrorAt = useRef(0);

  async function withBusy<T>(message: string, task: () => Promise<T>) {
    setBusyMessage(message);
    try {
      return await task();
    } catch {
      toast.error("The request took too long or the connection was interrupted. Please try again.");
      return undefined;
    } finally {
      setBusyMessage("");
    }
  }

  const load = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const canLoadTargets = role !== "student" && (permissions.create || permissions.edit || permissions.assign);
    try {
      const [classroomsRes, targetsRes] = await Promise.all([
        fetch("/api/classrooms", { cache: "no-store", signal: controller.signal }),
        canLoadTargets ? fetch("/api/classrooms/targets", { cache: "no-store", signal: controller.signal }) : Promise.resolve(null as any),
      ]);
      const classroomPayload = await classroomsRes.json().catch(() => ([]));
      if (!classroomsRes.ok) throw new Error(classroomPayload?.error || "Could not load classrooms");
      setItems(Array.isArray(classroomPayload) ? classroomPayload.map(normalizeClassroomItem) : []);
      if (targetsRes?.ok) setTargets(await targetsRes.json());
    } catch {
      const now = Date.now();
      if (now - lastLoadErrorAt.current > 30000) {
        toast.error("Classrooms could not be refreshed. Please try again.");
        lastLoadErrorAt.current = now;
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [permissions.assign, permissions.create, permissions.edit, role]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedCourse = useMemo(() => targets.courses.find((course) => course._id === form.course), [targets.courses, form.course]);
  const selectedLevel = useMemo(
    () => selectedCourse?.levels?.find((level) => level.name === form.levelName) || null,
    [selectedCourse, form.levelName]
  );
  const selectedSeriesTopics = useMemo(() => {
    if (form.classroomType !== "series") return [];
    if (form.seriesTopicMode === "selected") {
      return form.selectedTopicNames
        .map((topicName) => (selectedLevel?.topics || []).find((topic) => topic.name === topicName))
        .filter(Boolean) as Array<{ name: string; order?: number }>;
    }
    return selectedLevel?.topics || [];
  }, [form.classroomType, form.selectedTopicNames, form.seriesTopicMode, selectedLevel]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.coach) {
        const primaryMatches = String((item.coach as any)?._id || item.coach || "") === filters.coach;
        const substituteMatches = (item.generatedSessions || []).some((session: any) => String(session?.substituteCoach?._id || session?.substituteCoach || "") === filters.coach);
        if (!primaryMatches && !substituteMatches) return false;
      }
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

  const activeBatch = useMemo(() => {
    if (!groupFocus?.id) return null;
    return targets.batches.find((batch) => batch._id === groupFocus.id) || groupFocus;
  }, [groupFocus, targets.batches]);

  const selectedBatchStudentNames = useMemo(() => {
    const batchStudents = activeBatch?.students || [];
    return batchStudents.map((student) => student.name).filter(Boolean).join(", ");
  }, [activeBatch]);

  const groupScopedItems = useMemo(() => {
    if (!groupFocus?.id) return items;
    return items.filter((item) => (item.batches || []).some((batch: any) => String(batch?._id || batch || "") === groupFocus.id));
  }, [groupFocus?.id, items]);

  const studentFilterOptions = useMemo(() => {
    if (!activeBatch?.students?.length) return targets.students;
    const activeIds = new Set(activeBatch.students.map((student) => student._id));
    const merged = [...activeBatch.students, ...targets.students.filter((student) => !activeIds.has(student._id))];
    return merged;
  }, [activeBatch, targets.students]);

  const groupSummaries = useMemo(() => {
    return targets.batches
      .map((batch) => {
        const batchItems = filteredItems.filter((item) => (item.batches || []).some((itemBatch: any) => String(itemBatch?._id || itemBatch || "") === batch._id));
        const sessions = flattenScheduledSessions(batchItems);
        const courseNames = uniqueText(batchItems.map((item) => item.courseName || ""));
        const levelNames = uniqueText(batchItems.map((item) => item.levelName || batch.level || ""));
        return {
          batch,
          classroomCount: batchItems.length,
          sessionCount: sessions.length,
          upcomingCount: sessions.filter((row) => isSessionUpcomingLike(deriveScheduledSessionStatus(row.session, new Date()))).length,
          courseNames,
          levelNames,
        };
      })
      .filter((row) => row.classroomCount > 0);
  }, [filteredItems, targets.batches]);

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

  function resetModal(mode: CreateMode, item?: ClassroomItem | null, seriesTopicMode: SeriesTopicMode = "all") {
    setStudentSearch("");
    setCoachSearch("");
    if (!item) {
      setForm(blankForm());
      setEditItem(null);
      setStep(1);
      setOpen(true);
      setForm((current) => ({ ...current, classroomType: mode, seriesTopicMode, endCondition: mode === "series" ? "course_complete" : current.endCondition }));
      return;
    }
    setEditItem(item);
    setForm({
      classroomType: item.classroomType || mode,
      title: item.title || "",
      course: String((item.course as any)?._id || item.course || ""),
      courseName: item.courseName || "",
      levelName: item.levelName || "",
      topicName: item.topicName || "",
      topicOrder: 0,
      useCustomTopic: !item.courseName || !item.topicName,
      customTopicName: item.topicName || "",
      seriesTopicMode: item.seriesTopicMode || "all",
      classCount: item.sessionPlan?.length || item.generatedSessions?.length || 1,
      selectedTopicNames: item.seriesTopicMode === "selected" ? (item.sessionPlan || []).map((session) => session.topicName) : [],
      classDate: item.classDate ? formatDateInput(item.classDate) : "",
      startTime: item.startTime || "",
      durationMinutes: item.durationMinutes || 60,
      meetingUrl: item.meetingUrl || "",
      startDate: item.startDate ? formatDateInput(item.startDate) : "",
      frequency: item.frequency || "weekly",
      sessionsPerWeek: item.sessionsPerWeek || 1,
      daysOfWeek: normalizeDays(item),
      endCondition: item.endCondition || "course_complete",
      endDate: item.endDate ? formatDateInput(item.endDate) : "",
      endAfterSessions: item.endAfterSessions || item.generatedSessions?.length || 20,
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

  function updateDuration(durationMinutes: number) {
    setForm((current) => ({
      ...current,
      durationMinutes,
      daysOfWeek: current.classroomType === "series"
        ? current.daysOfWeek.map((day) => ({
            ...day,
            slots: day.slots.map((slot) => ({ ...slot, durationMinutes })),
          }))
        : current.daysOfWeek,
    }));
  }

  function updatePermanentScheduleDay(index: number, day: number) {
    setActionDraft((current: any) => ({
      ...current,
      daysOfWeek: (current.daysOfWeek || []).map((item: any, itemIndex: number) =>
        itemIndex === index ? { ...item, day } : item
      ),
    }));
  }

  function updatePermanentScheduleSlot(dayIndex: number, slotIndex: number, update: any) {
    setActionDraft((current: any) => ({
      ...current,
      daysOfWeek: (current.daysOfWeek || []).map((item: any, itemIndex: number) =>
        itemIndex === dayIndex
          ? {
              ...item,
              slots: (item.slots || []).map((slot: any, currentSlotIndex: number) =>
                currentSlotIndex === slotIndex ? { ...slot, ...update } : slot
              ),
            }
          : item
      ),
    }));
  }

  function addPermanentScheduleSlot() {
    setActionDraft((current: any) => ({
      ...current,
      daysOfWeek: [
        ...(current.daysOfWeek || []),
        { day: 1, slots: [{ startTime: "16:00", durationMinutes: current.durationMinutes || 60 }] },
      ],
    }));
  }

  function removePermanentScheduleSlot(index: number) {
    setActionDraft((current: any) => ({
      ...current,
      daysOfWeek: (current.daysOfWeek || []).filter((_: any, itemIndex: number) => itemIndex !== index),
    }));
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
      selectedTopicNames: [],
      classCount: 1,
    });
  }

  function setLevel(levelName: string) {
    const level = selectedCourse?.levels?.find((item) => item.name === levelName);
    updateForm({
      levelName,
      topicName: level?.topics?.[0]?.name || "",
      topicOrder: Number(level?.topics?.[0]?.order || 0),
      selectedTopicNames: [],
      classCount: 1,
    });
  }

  function setClassCount(classCount: number) {
    const nextCount = Math.max(1, Math.min(Number(classCount || 1), selectedLevel?.topics?.length || 1));
    setForm((current) => ({
      ...current,
      classCount: nextCount,
      selectedTopicNames: current.selectedTopicNames.slice(0, nextCount),
      endCondition: "course_complete",
      endAfterSessions: nextCount,
    }));
  }

  function toggleSeriesTopic(topicName: string) {
    setForm((current) => {
      if (current.selectedTopicNames.includes(topicName)) {
        return { ...current, selectedTopicNames: current.selectedTopicNames.filter((name) => name !== topicName) };
      }
      if (current.selectedTopicNames.length >= current.classCount) {
        toast.error(`You have already selected ${current.classCount} topic${current.classCount > 1 ? "s" : ""}.`);
        return current;
      }
      return { ...current, selectedTopicNames: [...current.selectedTopicNames, topicName] };
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
      if (!form.title.trim()) return toast.error("Enter a class name.");
      if (!form.coach) return toast.error("Select a coach.");
      if (form.classroomType === "single" && (!form.classDate || !form.startTime)) return toast.error("Select the class date and start time.");
      if (form.classroomType === "series" && !form.startDate) return toast.error("Select the series start date.");
      if (form.classroomType === "series" && !form.daysOfWeek.some((day) => day.slots.some((slot) => slot.startTime))) return toast.error("Add at least one day and time slot.");
      if (form.classroomType === "series" && !selectedSeriesTopics.length) return toast.error("Select a course level with at least one topic.");
      if (form.classroomType === "series" && form.endCondition === "on_date" && !form.endDate) return toast.error("Select the series end date.");
      const reviewTopicName = form.classroomType === "series" && form.seriesTopicMode === "selected"
        ? `${selectedSeriesTopics.length} selected topics`
        : form.useCustomTopic
          ? form.customTopicName
          : form.topicName;
      if (form.classroomType === "series" && form.seriesTopicMode === "selected" && form.selectedTopicNames.length !== form.classCount) {
        toast.error(`Select ${form.classCount} topic${form.classCount > 1 ? "s" : ""} in order.`);
        return;
      }
      const sessionPlan =
        form.classroomType === "single"
          ? [{
              sessionNumber: 1,
              topicName: reviewTopicName || form.title || "Session 1",
              topicOrder: Number(form.topicOrder || 0),
            }]
          : selectedSeriesTopics.map((topic, index) => ({
              sessionNumber: index + 1,
              topicName: topic.name,
              topicOrder: form.seriesTopicMode === "selected" ? index + 1 : Number(topic.order ?? index),
            }));

      const payload = {
        ...form,
        sessionsPerWeek: form.daysOfWeek.reduce((total, day) => total + day.slots.filter((slot) => slot.startTime).length, 0),
        topicName: reviewTopicName,
        endCondition: form.classroomType === "series" && form.seriesTopicMode === "selected" ? "course_complete" : form.endCondition,
        endAfterSessions: form.classroomType === "series" && form.seriesTopicMode === "selected" ? form.classCount : form.endAfterSessions,
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
    if (!actionCanSubmit(actionModal.type, actionDraft)) return toast.error("Complete the required fields before applying this action.");
    await withBusy("Updating classroom...", async () => {
      const response = await fetch(`/api/classrooms/${actionModal.item!._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionModal.type, sessionId: actionModal.session?._id, ...actionDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Could not update class");
        return;
      }
      toast.success(actionSuccessMessage(actionModal.type));
      setActionModal({ type: "", item: null });
      setActionDraft({});
      await load();
    });
  }

  async function deleteItem(item: ClassroomItem) {
    const target = item.classroomType === "series" ? `the entire series “${item.title}” and all of its classes` : `“${item.title}”`;
    if (!window.confirm(`Permanently delete ${target}? This also removes its classroom records and cannot be undone.`)) return;
    await withBusy("Deleting classroom...", async () => {
      const response = await fetch(`/api/classrooms/${item._id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(data.error || "Could not delete class");
      toast.success("Class deleted");
      await load();
    });
  }

  async function openTestClassroom() {
    await withBusy("Preparing test classroom...", async () => {
      const response = await fetch("/api/classrooms/test", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Could not prepare test classroom");
        return;
      }
      toast.success("Test classroom ready");
      await load();
      const sessionQuery = data.sessionId ? `?session=${encodeURIComponent(data.sessionId)}` : "";
      router.push(`/classrooms/${data.classroomId}/live${sessionQuery}`);
    });
  }

  const canManageClassrooms = role !== "student" && (permissions.create || permissions.edit || permissions.cancel || permissions.assign);
  if (!canManageClassrooms) {
    return <SimpleClassroomList items={items} loading={loading} role={role} canJoin={permissions.join} canManageAttendance={permissions.attendance} />;
  }

  return (
    <>
    <PageLoadingOverlay visible={!!busyMessage} message={busyMessage} />
    <div className="min-h-full space-y-4 text-slate-950">
      <div className="flex flex-none flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand">
            <GraduationCap size={12} />
            {groupFocus ? "Group Classroom" : "Classroom Management"}
          </div>
          <h1 className="text-lg font-bold leading-tight text-slate-950">{groupFocus ? groupFocus.name : "Classes"}</h1>
          {groupFocus ? (
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-600">
              <span>{activeBatch?.level ? titleCase(activeBatch.level) : "Level not set"}</span>
              <span>-</span>
              <span>{activeBatch?.students?.length || 0} students</span>
              {selectedBatchStudentNames ? <span className="max-w-xl truncate" title={selectedBatchStudentNames}>- {selectedBatchStudentNames}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {groupFocus ? (
            <Link href="/classrooms" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <ArrowLeft size={13} /> All Groups
            </Link>
          ) : null}
          {isSuperAdmin && (
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-xs font-bold text-violet-700 shadow-sm hover:bg-violet-100" onClick={openTestClassroom}>
              <CopyPlus size={13} /> Test Classroom
            </button>
          )}
          {permissions.create && (
            <>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50" onClick={() => resetModal("single")}>
                <Plus size={13} /> Single
              </button>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50" onClick={() => resetModal("series", null, "selected")}>
                <ListChecks size={13} /> Topics
              </button>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand/90" onClick={() => resetModal("series")}>
                <CalendarDays size={13} /> Series
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid flex-none gap-1.5 rounded-md border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-3 xl:grid-cols-[repeat(6,minmax(0,1fr))]">
        <FilterSelect label="Coach" value={filters.coach} onChange={(value) => setFilters((current) => ({ ...current, coach: value }))} options={targets.coaches.map((coach) => ({ value: coach._id, label: coach.name }))} />
        {!groupFocus && <FilterSelect label="Group" value={filters.batch} onChange={(value) => setFilters((current) => ({ ...current, batch: value }))} options={targets.batches.map((batch) => ({ value: batch._id, label: batch.name }))} />}
        <FilterSelect label="Student" value={filters.student} onChange={(value) => setFilters((current) => ({ ...current, student: value }))} options={studentFilterOptions.map((student) => ({ value: student._id, label: student.name }))} />
        <FilterSelect label="Course" value={filters.course} onChange={(value) => setFilters((current) => ({ ...current, course: value }))} options={uniqueOptions(groupScopedItems.map((item) => item.courseName).filter(Boolean) as string[])} />
        <FilterSelect label="Level" value={filters.level} onChange={(value) => setFilters((current) => ({ ...current, level: value }))} options={uniqueOptions(groupScopedItems.map((item) => item.levelName).filter(Boolean) as string[])} />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(value) => setFilters((current) => ({ ...current, status: value as SessionFilterStatus }))}
          options={["upcoming", "join_available", "ongoing", "completed", "missed", "abandoned", "coach_no_show", "student_no_show", "technical_issue", "cancelled", "rescheduled"].map((value) => ({ value, label: titleCase(value) }))}
        />
      </div>

      {!groupFocus && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Groups</div>
              <div className="text-sm font-semibold text-slate-950">Filter groups, then open the group to manage its individual classes.</div>
            </div>
          </div>
          {loading ? (
            <div className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">Loading groups...</div>
          ) : groupSummaries.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">No groups match the current filters.</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {groupSummaries.map(({ batch, classroomCount, sessionCount, upcomingCount, courseNames, levelNames }) => (
                <div key={batch._id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/classrooms/groups/${batch._id}`} className="truncate text-sm font-bold text-slate-950 hover:text-brand" title={batch.name}>
                      {batch.name}
                    </Link>
                    <div className="mt-0.5 truncate text-xs text-slate-500" title={`${courseNames.join(", ") || "Course not set"} - ${levelNames.join(", ") || "Level not set"}`}>
                      {courseNames.join(", ") || "Course not set"} - {levelNames.join(", ") || "Level not set"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600">
                      <span>{batch.students?.length || 0} students</span>
                      <span>{classroomCount} classrooms</span>
                      <span>{sessionCount} classes</span>
                      <span>{upcomingCount} upcoming</span>
                    </div>
                  </div>
                  <Link href={`/classrooms/groups/${batch._id}`} className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand/90">
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {groupFocus ? (
      <div className="rounded-lg border border-brand/10 bg-white shadow-xl shadow-brand/5">
          <div className="p-3">
            {loading ? (
              <div className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Loading classes...</div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No classes match the current filters.</div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const summarySessionId = latestSummarySessionId(item);
                  const summaryHref = summarySessionId ? `/classrooms/${item._id}/summary?session=${summarySessionId}` : `/classrooms/${item._id}/summary`;
                  const lifecycleRollup = classroomLifecycleRollup(item);
                  const batchNames = batchNamesForItem(item, targets.batches);
                  const studentNames = studentNamesForItem(item);
                  const timingLabel = item.classroomType === "single"
                    ? `${formatDate(item.classDate)} at ${item.startTime || "--"} for ${formatDuration(item.durationMinutes || 60)}`
                    : `${item.generatedSessions?.length || 0} sessions - starts ${formatDate(item.startDate)}`;
                  return (
                    <div key={item._id} className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm transition hover:border-brand/20 hover:bg-slate-50">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-base font-bold text-slate-950" title={item.title}>{item.title}</div>
                              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                                <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">{item.classroomType === "single" ? "Single" : "Series"}</span>
                                {item.isTestClassroom && <span className="rounded-full bg-violet-50 px-2.5 py-1 font-bold text-violet-700">Test Classroom</span>}
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{titleCase(item.status)}</span>
                                {item.courseName && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">{item.courseName}</span>}
                                {item.levelName && <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">{item.levelName}</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 justify-start gap-1 lg:justify-end">
                              <IconAction href={summaryHref} icon={<Eye size={15} />} label="View details" />
                              {permissions.edit && <IconAction icon={<Pencil size={15} />} label="Edit classroom" onClick={() => resetModal(item.classroomType, item)} />}
                              {permissions.cancel && <IconAction destructive icon={<Trash2 size={15} />} label={item.classroomType === "series" ? "Delete entire series" : "Delete class"} onClick={() => deleteItem(item)} />}
                            </div>
                          </div>

                          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-[minmax(160px,1.1fr)_repeat(6,minmax(86px,auto))]">
                            <CompactInfo label="Topic" value={item.topicName || "Not set"} />
                            <CompactInfo label="Coach" value={(item.coach as any)?.name || "Unassigned"} />
                            <CompactInfo label="Batch" value={batchNames || "Unassigned"} />
                            <CompactInfo label="Students" value={studentNames || `${item.students?.length || 0} assigned`} />
                            <CompactInfo label="Level" value={item.levelName || "Not set"} />
                            <CompactInfo label="Meeting" value={item.meetingUrl ? "Ready" : "Not added"} />
                            <CompactInfo label="Schedule" value={timingLabel} />
                          </div>

                          {lifecycleRollup.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Lifecycle</span>
                              {lifecycleRollup.map(([status, count]) => (
                                <span key={`${item._id}-${status}`} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sessionStatusTone(status)}`}>
                                  {count} {titleCase(status)}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <details className="rounded-md border border-slate-200 bg-slate-50" open>
                            <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-bold text-slate-700">
                              Individual classes ({item.generatedSessions?.length || 0})
                            </summary>
                            <div className="border-t border-slate-200 p-2">
                              <GroupClassSessionList
                                items={[item]}
                                targets={targets}
                                statusFilter={filters.status}
                                role={role}
                                permissions={permissions}
                                setActionModal={setActionModal}
                                setActionDraft={setActionDraft}
                              />
                            </div>
                          </details>
                        </div>

                        <div className="flex flex-none flex-col gap-2 xl:max-w-[220px] xl:items-end">
                          <div className="flex flex-wrap justify-start gap-1 xl:justify-end">
                            {permissions.edit && item.classroomType === "single" && item.status === "scheduled" && <ActionButton icon={<Clock3 size={14} />} label="Reschedule" onClick={() => { setActionModal({ type: "reschedule_class", item }); setActionDraft({ classDate: item.classDate ? formatDateInput(item.classDate) : "", startTime: item.startTime || "", durationMinutes: item.durationMinutes || 60 }); }} />}
                            {permissions.cancel && item.status !== "cancelled" && item.status !== "completed" && <ActionButton icon={<X size={14} />} label={item.classroomType === "series" ? "Cancel Entire Series" : "Cancel Class"} onClick={() => { setActionModal({ type: item.classroomType === "series" ? "cancel_series" : "cancel_class", item }); setActionDraft({}); }} />}
                            {permissions.assign && item.status !== "cancelled" && item.status !== "completed" && <ActionButton icon={<UserCog size={14} />} label="Substitute Coach" onClick={() => { setActionModal({ type: "substitute_coach", item }); setActionDraft({ scope: item.classroomType === "series" ? "future" : "entire", coach: "" }); }} />}
                            {permissions.edit && item.classroomType === "series" && item.status !== "cancelled" && item.status !== "completed" && <ActionButton icon={<Clock3 size={14} />} label="Permanent Timing" onClick={() => {
                              const futureSession = (item.generatedSessions || []).find((session: any) => isSessionUpcomingLike(deriveScheduledSessionStatus(session, new Date())));
                              setActionModal({ type: "permanent_schedule_change", item });
                              setActionDraft({
                                effectiveDate: futureSession?.scheduledFor ? formatDateInput(futureSession.scheduledFor) : "",
                                daysOfWeek: flattenScheduleSlots(normalizeDays(item)),
                                reason: "",
                              });
                            }} />}
                            {permissions.edit && item.classroomType === "series" && item.status !== "cancelled" && item.status !== "completed" && <ActionButton icon={<CalendarDays size={14} />} label="Just break" onClick={() => { setActionModal({ type: "shift_future_sessions", item }); setActionDraft({ restartDate: "", reason: "Just break" }); }} />}
                            {permissions.create && item.classroomType === "series" && item.status !== "cancelled" && item.status !== "completed" && <ActionButton icon={<CopyPlus size={14} />} label="Add Extra Class" onClick={() => { setActionModal({ type: "add_extra_class", item }); setActionDraft({ topicName: "", classDate: "", startTime: item.startTime || "16:00", durationMinutes: item.durationMinutes || 60 }); }} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>
      ) : null}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">{classroomModeLabel(form)}</div>
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
                    <div className={cn("grid gap-4", form.classroomType === "single" ? "sm:grid-cols-2" : "")}>
                      <Field label="Level">
                        <select className="input h-10" value={form.levelName} onChange={(event) => setLevel(event.target.value)}>
                          <option value="">Select level</option>
                          {(selectedCourse?.levels || []).map((level) => <option key={level.name} value={level.name}>{level.name}</option>)}
                        </select>
                      </Field>
                      {form.classroomType === "single" && (
                        <Field label="Topic">
                          <select className="input h-10" value={form.topicName} onChange={(event) => updateForm({ topicName: event.target.value })} disabled={form.useCustomTopic}>
                            <option value="">Select topic</option>
                            {(selectedLevel?.topics || []).map((topic) => <option key={topic.name} value={topic.name}>{topic.name}</option>)}
                          </select>
                        </Field>
                      )}
                    </div>
                    {form.classroomType === "single" && (
                      <>
                        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                          <input type="checkbox" checked={form.useCustomTopic} onChange={(event) => updateForm({ useCustomTopic: event.target.checked, customTopicName: event.target.checked ? form.customTopicName : "" })} />
                          Custom Topic
                        </label>
                        {form.useCustomTopic && (
                          <Field label="Custom Topic Name">
                            <input className="input h-10" value={form.customTopicName} onChange={(event) => updateForm({ customTopicName: event.target.value })} placeholder="Enter custom topic name" />
                          </Field>
                        )}
                      </>
                    )}
                    {form.classroomType === "series" && form.seriesTopicMode === "selected" && (
                      <SelectedSeriesTopicPicker form={form} selectedLevel={selectedLevel} setClassCount={setClassCount} toggleSeriesTopic={toggleSeriesTopic} />
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
                          <select className="input h-10" value={form.durationMinutes} onChange={(event) => updateDuration(Number(event.target.value))}>
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
                          <Field label="Time Zone">
                            <div className="input flex h-10 items-center bg-slate-50 font-semibold text-slate-700">India Standard Time (IST)</div>
                          </Field>
                        </div>
                        <Field label="Planned Sessions Per Week">
                          <div className="input flex h-10 items-center bg-slate-50 font-semibold text-slate-700">
                            {form.daysOfWeek.reduce((total, day) => total + day.slots.filter((slot) => slot.startTime).length, 0)} session(s), based on the slots below
                          </div>
                        </Field>
                        <SeriesScheduleEditor form={form} updateForm={updateForm} updateDay={updateDay} />
                        {form.seriesTopicMode === "selected" ? (
                          <Field label="Series Length">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                              {form.selectedTopicNames.length} of {form.classCount} topics selected. The series ends after the selected topics are scheduled.
                            </div>
                          </Field>
                        ) : (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="End Condition">
                              <select className="input h-10" value={form.endCondition} onChange={(event) => updateForm({ endCondition: event.target.value as EndCondition })}>
                                <option value="on_date">End on Specific Date</option>
                                <option value="after_n_sessions">End After Number of Sessions</option>
                                <option value="course_complete">End When Course is Completed</option>
                                <option value="never">Rolling 52-Session Schedule</option>
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
                                <select className="input h-10" value={form.durationMinutes} onChange={(event) => updateDuration(Number(event.target.value))}>
                                  {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                              </Field>
                            )}
                          </div>
                        )}
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
                      <ReviewRow label="Topic" value={form.classroomType === "series" ? `${selectedSeriesTopics.length} topic${selectedSeriesTopics.length === 1 ? "" : "s"}` : form.useCustomTopic ? form.customTopicName : form.topicName || "Not set"} />
                      <ReviewRow label="Coach" value={targets.coaches.find((coach) => coach._id === form.coach)?.name || "Not assigned"} />
                      <ReviewRow label="Students" value={`${form.students.length} selected`} />
                      <ReviewRow label="Meeting" value={form.meetingUrl ? "Meeting ready" : "Not added"} />
                      <ReviewRow label="Duration" value={reviewDurationLabel(form)} />
                      <ReviewRow label="Type" value={classroomModeLabel(form)} />
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
                        {selectedSeriesTopics.map((topic, index) => (
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
                <button onClick={submitForm} className="btn-primary">{editItem ? "Save Classroom" : "Confirm and Create"}</button>
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
                {actionModal.session ? (
                  <div className="mt-1 text-xs font-semibold text-slate-600">
                    Class {actionModal.session.sessionNumber || ""}: {actionModal.session.topicName || actionModal.item.topicName || "Topic not set"}
                  </div>
                ) : null}
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
              {actionModal.type === "update_session" && (
                <div className="grid gap-4">
                  <Field label="Topic"><input className="input h-10" value={actionDraft.topicName || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, topicName: event.target.value }))} /></Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Date (IST)"><input type="date" className="input h-10" value={actionDraft.classDate || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, classDate: event.target.value }))} /></Field>
                    <Field label="Time (IST)"><input type="time" className="input h-10" value={actionDraft.startTime || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, startTime: event.target.value }))} /></Field>
                    <Field label="Duration"><select className="input h-10" value={actionDraft.durationMinutes || 60} onChange={(event) => setActionDraft((current: any) => ({ ...current, durationMinutes: Number(event.target.value) }))}>{durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                  </div>
                </div>
              )}
              {actionModal.type === "reschedule_session" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="New Date (IST)"><input type="date" className="input h-10" value={actionDraft.classDate || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, classDate: event.target.value }))} /></Field>
                  <Field label="New Time (IST)"><input type="time" className="input h-10" value={actionDraft.startTime || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, startTime: event.target.value }))} /></Field>
                  <Field label="Duration"><select className="input h-10" value={actionDraft.durationMinutes || 60} onChange={(event) => setActionDraft((current: any) => ({ ...current, durationMinutes: Number(event.target.value) }))}>{durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                </div>
              )}
              {actionModal.type === "shift_future_sessions" && (
                <div className="grid gap-4">
                  <Field label="Class Restart Date (IST)">
                    <input type="date" className="input h-10" value={actionDraft.restartDate || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, restartDate: event.target.value }))} />
                  </Field>
                  <Field label="Admin Note">
                    <textarea className="input min-h-24 py-2" value={actionDraft.reason || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, reason: event.target.value }))} placeholder="Optional reason for the break" />
                  </Field>
                  <div className="rounded-xl bg-sky-50 p-4 text-sm font-semibold text-sky-800">
                    All not-yet-started scheduled classes in this series will move together. The first future class restarts on this date, and the remaining future classes keep the same spacing after it.
                  </div>
                </div>
              )}
              {actionModal.type === "permanent_schedule_change" && (
                <div className="grid gap-4">
                  <Field label="Apply From (IST)">
                    <input type="date" className="input h-10" value={actionDraft.effectiveDate || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, effectiveDate: event.target.value }))} />
                  </Field>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Weekly Timings</div>
                      <button type="button" onClick={addPermanentScheduleSlot} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:border-brand hover:text-brand">
                        <Plus size={14} /> Add Timing
                      </button>
                    </div>
                    {(actionDraft.daysOfWeek || []).map((day: any, dayIndex: number) => {
                      const slot = day.slots?.[0] || { startTime: "", durationMinutes: 60 };
                      return (
                        <div key={`permanent-${dayIndex}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                          <Field label="Day">
                            <select className="input h-10" value={day.day} onChange={(event) => updatePermanentScheduleDay(dayIndex, Number(event.target.value))}>
                              {weekDays.map((option) => <option key={option.day} value={option.day}>{option.label}</option>)}
                            </select>
                          </Field>
                          <Field label="Time (IST)">
                            <input type="time" className="input h-10" value={slot.startTime || ""} onChange={(event) => updatePermanentScheduleSlot(dayIndex, 0, { startTime: event.target.value })} />
                          </Field>
                          <Field label="Duration">
                            <select className="input h-10" value={slot.durationMinutes || 60} onChange={(event) => updatePermanentScheduleSlot(dayIndex, 0, { durationMinutes: Number(event.target.value) })}>
                              {durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </Field>
                          <button type="button" onClick={() => removePermanentScheduleSlot(dayIndex)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600" aria-label="Remove timing">
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <Field label="Admin Note">
                    <textarea className="input min-h-20 py-2" value={actionDraft.reason || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, reason: event.target.value }))} placeholder="Optional reason for the timing change" />
                  </Field>
                  <div className="rounded-xl bg-sky-50 p-4 text-sm font-semibold text-sky-800">
                    Future not-yet-started classes will follow these weekly timings. Completed and already-started classes stay unchanged.
                  </div>
                </div>
              )}
              {actionModal.type === "substitute_coach" && (
                <>
                  {actionModal.session ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-800">
                      The substitute coach will be assigned only to this selected class.
                    </div>
                  ) : (
                    <Field label="Scope">
                      <select className="input h-10" value={actionDraft.scope || "entire"} onChange={(event) => setActionDraft((current: any) => ({ ...current, scope: event.target.value }))}>
                        {actionModal.item.classroomType === "series" && <option value="future">Future Sessions</option>}
                        <option value="entire">Entire {actionModal.item.classroomType === "series" ? "Series" : "Class"}</option>
                      </select>
                    </Field>
                  )}
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
              {actionModal.type === "mark_session_outcome" && (
                <div className="grid gap-4">
                  <Field label="Outcome">
                    <select className="input h-10" value={actionDraft.classOutcome || "completed"} onChange={(event) => setActionDraft((current: any) => ({ ...current, classOutcome: event.target.value }))}>
                      <option value="completed">Completed: topic taught</option>
                      <option value="completed_continue_topic">Completed: continue same topic next class</option>
                      <option value="abandoned">Not completed: carry topic forward</option>
                      <option value="coach_no_show">Coach no-show</option>
                      <option value="student_no_show">Student no-show</option>
                      <option value="technical_issue">Technical issue</option>
                      <option value="missed">Missed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </Field>
                  <Field label="Reason">
                    <textarea className="input min-h-24 py-2" value={actionDraft.reason || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, reason: event.target.value }))} placeholder="Optional admin note" />
                  </Field>
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Completed consumes the topic. Continue topic charges the class, repeats the topic next class, shifts later topics, and adds one extra class at the end.
                  </div>
                </div>
              )}
              {actionModal.type === "change_session_topic" && (
                <div className="grid gap-4">
                  <Field label="Correct Topic">
                    <>
                      <input
                        className="input h-10"
                        list="classroom-topic-options"
                        value={actionDraft.topicName || ""}
                        onChange={(event) => setActionDraft((current: any) => ({ ...current, topicName: event.target.value }))}
                        placeholder="Enter or select the topic"
                      />
                      <datalist id="classroom-topic-options">
                        {(actionModal.item?.sessionPlan || []).map((topic) => (
                          <option key={`${topic.sessionNumber}-${topic.topicName}`} value={topic.topicName} />
                        ))}
                      </datalist>
                    </>
                  </Field>
                  <Field label="Reason">
                    <textarea className="input min-h-24 py-2" value={actionDraft.reason || ""} onChange={(event) => setActionDraft((current: any) => ({ ...current, reason: event.target.value }))} placeholder="Optional admin note" />
                  </Field>
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    This locks the corrected class topic and recalibrates the remaining unlocked classes so later topics do not duplicate it.
                  </div>
                </div>
              )}
              {actionModal.type === "cancel_class" && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">This will cancel the selected class without deleting its record.</div>}
              {actionModal.type === "cancel_series" && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">This will cancel the entire series and all unfinished classes in it. Existing records will be kept.</div>}
              {actionModal.type === "cancel_session" && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">This will cancel only this class. The rest of the series will remain scheduled.</div>}
              {actionModal.type === "delete_session" && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">This permanently deletes only this class from the series. If attendance or live-class records already exist, deletion will be blocked and you can cancel it instead.</div>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setActionModal({ type: "", item: null })} className="btn-outline">Close</button>
              <button disabled={!actionCanSubmit(actionModal.type, actionDraft)} onClick={runAction} className={cn(actionModal.type.startsWith("cancel") || actionModal.type.startsWith("delete") ? "btn-primary bg-red-600 hover:bg-red-700" : "btn-primary", "disabled:cursor-not-allowed disabled:opacity-50")}>
                {actionConfirmLabel(actionModal.type)}
              </button>
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
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-900" title={value}>{value}</div>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
    >
      {icon}
    </button>
  );
}

function IconAction({ icon, label, onClick, href, destructive = false }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string; destructive?: boolean }) {
  const className = cn(
    "grid h-8 w-8 place-items-center rounded-md border bg-white shadow-sm transition",
    destructive
      ? "border-red-200 text-red-600 hover:bg-red-50"
      : "border-slate-200 text-slate-700 hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
  );
  if (href) {
    return <Link href={href} title={label} aria-label={label} className={className}>{icon}</Link>;
  }
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={className}>{icon}</button>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 shadow-sm">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <select className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-900 outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function SelectedSeriesTopicPicker({
  form,
  selectedLevel,
  setClassCount,
  toggleSeriesTopic,
}: {
  form: ReturnType<typeof blankForm>;
  selectedLevel: CourseOption["levels"][number] | null;
  setClassCount: (classCount: number) => void;
  toggleSeriesTopic: (topicName: string) => void;
}) {
  const topics = selectedLevel?.topics || [];
  const selectedSet = new Set(form.selectedTopicNames);
  const [classCountDraft, setClassCountDraft] = useState(String(form.classCount || 1));

  useEffect(() => {
    setClassCountDraft(String(form.classCount || 1));
  }, [form.classCount]);

  function commitClassCountDraft(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setClassCountDraft(String(form.classCount || 1));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setClassCountDraft(String(form.classCount || 1));
      return;
    }
    setClassCount(parsed);
  }

  function handleClassCountChange(rawValue: string) {
    if (!/^\d*$/.test(rawValue)) return;
    setClassCountDraft(rawValue);
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    setClassCount(parsed);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Number of Classes">
          <input
            type="text"
            className="input h-10"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={classCountDraft}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => handleClassCountChange(event.target.value)}
            onBlur={(event) => commitClassCountDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitClassCountDraft(event.currentTarget.value);
                event.currentTarget.blur();
              }
            }}
          />
        </Field>
        <div className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-600">
          Select topics in the exact order the classes should be created. Selected topics cannot exceed the class count.
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Selected Order</div>
        {form.selectedTopicNames.length ? (
          <div className="flex flex-wrap gap-2">
            {form.selectedTopicNames.map((topicName, index) => (
              <button
                key={`${topicName}-${index}`}
                type="button"
                onClick={() => toggleSeriesTopic(topicName)}
                className="inline-flex items-center gap-2 rounded-lg border border-brand/20 bg-white px-3 py-2 text-sm font-bold text-brand shadow-sm"
              >
                {index + 1}. {topicName}
                <X size={13} />
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">No topics selected yet.</div>
        )}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {topics.map((topic, index) => {
          const active = selectedSet.has(topic.name);
          const position = form.selectedTopicNames.indexOf(topic.name) + 1;
          return (
            <button
              key={`${topic.name}-${index}`}
              type="button"
              onClick={() => toggleSeriesTopic(topic.name)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm shadow-sm transition",
                active ? "border-brand bg-brand/10 text-brand" : "border-white bg-white text-slate-700 hover:border-slate-200"
              )}
            >
              <span className="min-w-0 truncate font-semibold">{topic.name}</span>
              {active && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black">{position}</span>}
            </button>
          );
        })}
      </div>
    </div>
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

function GroupClassSessionList({
  items,
  targets,
  statusFilter,
  role,
  permissions,
  setActionModal,
  setActionDraft,
}: {
  items: ClassroomItem[];
  targets: TargetsPayload;
  statusFilter: SessionFilterStatus;
  role?: Role;
  permissions?: ClassroomPermissions;
  setActionModal?: React.Dispatch<React.SetStateAction<{ type: string; item: ClassroomItem | null; session?: any }>>;
  setActionDraft?: React.Dispatch<React.SetStateAction<any>>;
}) {
  const now = new Date();
  const rows = dedupeSessionRows(flattenScheduledSessions(items))
    .filter((row) => row.start)
    .filter((row) => !statusFilter || deriveScheduledSessionStatus(row.session, now) === statusFilter)
    .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));

  if (!rows.length) {
    return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No individual classes match the current filters.</div>;
  }

  return (
    <div className="space-y-1.5">
      {rows.map(({ classroom, session }: any, index) => {
        const status = deriveScheduledSessionStatus(session, now);
        const sessionId = String(session?._id || "");
        const summaryHref = sessionId ? `/classrooms/${classroom._id}/summary?session=${sessionId}` : `/classrooms/${classroom._id}/summary`;
        const batchNames = batchNamesForItem(classroom, targets.batches);
        const studentNames = studentNamesForItem(classroom);
        const isFinished = status === "completed" || Boolean(session.actualEndedAt);
        const isCancelled = status === "cancelled";
        const canOpenActions = permissions && role && setActionModal && setActionDraft;
        return (
          <div key={`${classroom._id}-${sessionId || index}`} className="grid gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm lg:grid-cols-[minmax(170px,1.1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(120px,0.8fr)_minmax(128px,auto)] lg:items-center">
            <div className="min-w-0">
              <Link href={summaryHref} className="truncate text-sm font-bold text-slate-950 hover:text-brand" title={classroom.title}>
                {classroom.title}
              </Link>
              <div className="mt-0.5 truncate text-slate-500" title={session.topicName || classroom.topicName || "Topic not set"}>
                {session.topicName || classroom.topicName || "Topic not set"}
              </div>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-700">{formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))}</div>
              <div className="text-slate-500">{session.startTime || classroom.startTime || "--"} IST - {formatDuration(Number(session.durationMinutes || classroom.durationMinutes || 60))}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-700" title={batchNames || "Unassigned"}>{batchNames || "Unassigned"}</div>
              <div className="truncate text-slate-500" title={studentNames || ""}>{studentNames || `${classroom.students?.length || 0} students`}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-700" title={classroom.courseName || "Course not set"}>{classroom.courseName || "Course not set"}</div>
              <div className="truncate text-slate-500" title={classroom.levelName || "Level not set"}>{classroom.levelName || "Level not set"}</div>
              <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", sessionStatusTone(status))}>{titleCase(status)}</span>
            </div>
            <div className="flex flex-wrap justify-start gap-1 lg:justify-end">
              <IconAction href={summaryHref} icon={<Eye size={14} />} label="Open class details" />
              {canOpenActions && permissions.edit && !isFinished && !isCancelled ? (
                <ActionButton icon={<Pencil size={14} />} label="Edit" onClick={() => {
                  setActionModal({ type: "update_session", item: classroom, session });
                  setActionDraft({ topicName: session.topicName || "", classDate: formatDateInput(session.scheduledFor), startTime: session.startTime || classroom.startTime || "", durationMinutes: session.durationMinutes || classroom.durationMinutes || 60 });
                }} />
              ) : null}
              {canOpenActions && permissions.edit && !isFinished && !isCancelled ? (
                <ActionButton icon={<Clock3 size={14} />} label="Reschedule" onClick={() => {
                  setActionModal({ type: "reschedule_session", item: classroom, session });
                  setActionDraft({ classDate: formatDateInput(session.scheduledFor), startTime: session.startTime || classroom.startTime || "", durationMinutes: session.durationMinutes || classroom.durationMinutes || 60 });
                }} />
              ) : null}
              {canOpenActions && permissions.assign && !isFinished && !isCancelled ? (
                <ActionButton icon={<UserCog size={14} />} label="Substitute Coach" onClick={() => {
                  setActionModal({ type: "substitute_coach", item: classroom, session });
                  setActionDraft({ scope: "session", coach: "" });
                }} />
              ) : null}
              {canOpenActions && permissions.edit ? (
                <ActionButton icon={<CheckSquare size={14} />} label="Outcome" onClick={() => {
                  setActionModal({ type: "mark_session_outcome", item: classroom, session });
                  setActionDraft({ classOutcome: session.summary?.classOutcome || session.status || "completed", reason: "" });
                }} />
              ) : null}
              {permissions?.attendance && (role === "admin" || role === "sub-admin") && !isCancelled ? (
                <IconAction href={attendanceHrefForSession(classroom, session)} icon={<CheckSquare size={14} />} label="Mark attendance" />
              ) : null}
              {canOpenActions && permissions.edit && (role === "admin" || role === "sub-admin") ? (
                <ActionButton icon={<ListChecks size={14} />} label="Topic" onClick={() => {
                  setActionModal({ type: "change_session_topic", item: classroom, session });
                  setActionDraft({ topicName: session.topicName || classroom.topicName || "", reason: "" });
                }} />
              ) : null}
              {canOpenActions && permissions.cancel && !isFinished && !isCancelled ? (
                <ActionButton icon={<X size={14} />} label="Cancel" onClick={() => { setActionModal({ type: "cancel_session", item: classroom, session }); setActionDraft({}); }} />
              ) : null}
              {canOpenActions && permissions.cancel && !isFinished ? (
                <ActionButton icon={<Trash2 size={14} />} label="Delete" onClick={() => { setActionModal({ type: "delete_session", item: classroom, session }); setActionDraft({}); }} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleClassroomList({
  items,
  loading,
  role,
  canJoin,
  canManageAttendance,
}: {
  items: ClassroomItem[];
  loading: boolean;
  role: Role;
  canJoin: boolean;
  canManageAttendance: boolean;
}) {
  const [futureDetails, setFutureDetails] = useState<{ classroom: ClassroomItem; session: any } | null>(null);
  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading classrooms...</div>;
  const now = new Date();
  const sessions = dedupeSessionRows(flattenScheduledSessions(items)
    .filter((row) => row.start)
    .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0)));
  const upcoming = sessions.filter((row) => isSessionUpcomingLike(deriveScheduledSessionStatus(row.session, now))).slice(0, 12);
  const history = sessions
    .filter((row) => {
      const status = deriveScheduledSessionStatus(row.session, now);
      return ["completed", "missed", "abandoned", "coach_no_show", "student_no_show", "technical_issue", "cancelled", "rescheduled"].includes(status);
    })
    .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0))
    .slice(0, 12);
  const currentRoleLabel = role === "student" ? "Coach" : "Batch / Students";
  const pageTitle = role === "student" ? "My Classes" : "Teaching Schedule";
  const pageSubtitle = role === "student" ? "Join classes only through your scheduled sessions." : "Upcoming sessions, completed class records, and classroom entry points.";
  const canUseAdminAttendance = canManageAttendance && (role === "admin" || role === "sub-admin");
  const statusTone = (status: string) => {
    if (status === "completed") return "bg-emerald-50 text-emerald-700";
    if (status === "missed") return "bg-amber-50 text-amber-700";
    if (status === "cancelled") return "bg-rose-50 text-rose-700";
    if (status === "rescheduled") return "bg-sky-50 text-sky-700";
    if (status === "abandoned") return "bg-amber-50 text-amber-700";
    if (status === "coach_no_show") return "bg-red-50 text-red-700";
    if (status === "student_no_show") return "bg-orange-50 text-orange-700";
    if (status === "technical_issue") return "bg-slate-100 text-slate-700";
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
                      <CompactInfo label={currentRoleLabel} value={role === "student" ? assignedCoachName(classroom, session) : ((classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} assigned`)} />
                      <CompactInfo label="When" value={`${formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} at ${session.startTime || classroom.startTime || "--"}`} />
                      <CompactInfo label="Duration" value={formatDuration(session.durationMinutes || classroom.durationMinutes || 60)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <JoinScheduledSessionButton
                      classroomId={String(classroom._id)}
                      sessionId={String(session._id)}
                      meetingUrl={classroom.meetingUrl}
                      className="btn-outline"
                      availableClassName="btn-primary"
                      unavailableClassName="btn-outline"
                      label="Join Classroom"
                      unavailableLabel={canJoin ? "Join Classroom" : "Join access not granted"}
                      disabled={!canJoin}
                      scheduledFor={session.scheduledFor || classroom.classDate || classroom.startDate}
                      startTime={session.startTime || classroom.startTime}
                      durationMinutes={session.durationMinutes || classroom.durationMinutes || 60}
                    />
                    {canUseAdminAttendance ? (
                      <Link href={attendanceHrefForSession(classroom, session)} className="btn-primary">
                        Mark Attendance
                      </Link>
                    ) : null}
                    <button type="button" className="btn-outline" onClick={() => setFutureDetails({ classroom, session })}>View Details</button>
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
                        <CompactInfo label={currentRoleLabel} value={role === "student" ? assignedCoachName(classroom, session) : ((classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} assigned`)} />
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
      {futureDetails ? (
        <FutureClassDetailsModal
          classroom={futureDetails.classroom}
          session={futureDetails.session}
          onClose={() => setFutureDetails(null)}
        />
      ) : null}
    </div>
  );
}

function FutureClassDetailsModal({
  classroom,
  session,
  onClose,
}: {
  classroom: ClassroomItem;
  session: any;
  onClose: () => void;
}) {
  const studentNames = (classroom.students || []).map((student: any) => student?.name || student?.email || student?.username || "").filter(Boolean);
  const batchNames = (classroom.batches || []).map((batch: any) => batch?.name || "").filter(Boolean).join(", ") || "Unassigned";
  const startDate = session?.scheduledFor || classroom.classDate || classroom.startDate;
  const startTime = String(session?.startTime || classroom.startTime || "");
  const duration = Number(session?.durationMinutes || classroom.durationMinutes || 60);
  const endTime = classEndTime(startDate, startTime, duration);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Class Details</div>
            <h2 className="mt-1 truncate text-2xl font-black text-slate-950">{classroom.title}</h2>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
          <InfoCard label="Batch" value={batchNames} />
          <InfoCard label="Course" value={classroom.courseName || "Course not set"} />
          <InfoCard label="Level" value={classroom.levelName || "Level not set"} />
          <InfoCard label="Topic" value={session?.topicName || classroom.topicName || "Topic not set"} />
          <InfoCard label="Start Time" value={`${formatDate(String(startDate || ""))} at ${startTime || "--"}`} />
          <InfoCard label="End Time" value={endTime || "Not set"} />
          <InfoCard label="Coach" value={assignedCoachName(classroom, session)} />
          <InfoCard label="Students" value={`${studentNames.length} assigned`} />
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <div className="mb-2 text-sm font-black text-slate-950">Students in this classroom</div>
          {studentNames.length ? (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap gap-2">
                {studentNames.map((name, index) => (
                  <span key={`${name}-${index}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{name}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No students assigned yet.</div>
          )}
        </div>
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

function classroomModeLabel(form: ReturnType<typeof blankForm>) {
  if (form.classroomType === "single") return "Single Class";
  return form.seriesTopicMode === "selected" ? "Selected Topic Series" : "Learning Series";
}

function formatDate(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function formatDateInput(value?: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function classEndTime(dateValue: any, startTime: string, durationMinutes: number) {
  if (!dateValue || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return "";
  const [hours, minutes] = startTime.split(":").map(Number);
  const end = new Date(dateValue);
  if (Number.isNaN(end.getTime())) return "";
  end.setHours(hours, minutes + Math.max(15, durationMinutes), 0, 0);
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(end);
}

function attendanceHrefForSession(classroom: ClassroomItem, session: any) {
  const scheduledFor = session?.scheduledFor || classroom.classDate || classroom.startDate;
  const date = scheduledFor ? formatDateInput(String(scheduledFor)) : new Date().toISOString().slice(0, 10);
  const sessionKey = `${String(classroom._id)}:${String(session?._id || "")}`;
  const params = new URLSearchParams({ date, session: sessionKey });
  return `/attendance?${params.toString()}`;
}

function reviewDurationLabel(form: ReturnType<typeof blankForm>) {
  if (form.classroomType !== "series") return formatDuration(form.durationMinutes);
  const slotDurations = form.daysOfWeek
    .flatMap((day) => day.slots.map((slot) => Number(slot.durationMinutes)))
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const uniqueDurations = Array.from(new Set(slotDurations));
  if (uniqueDurations.length === 0) return formatDuration(form.durationMinutes);
  if (uniqueDurations.length === 1) return formatDuration(uniqueDurations[0]);
  return `Varies: ${uniqueDurations.map(formatDuration).join(", ")}`;
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).map((value) => ({ value, label: value }));
}

function uniqueText(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function batchNamesForItem(item: ClassroomItem, batches: BatchOption[] = []) {
  return (item.batches || [])
    .map((batch: any) => {
      const id = String(batch?._id || batch || "");
      return batch?.name || batches.find((target) => target._id === id)?.name || "";
    })
    .filter(Boolean)
    .join(", ");
}

function studentNamesForItem(item: ClassroomItem) {
  return (item.students || [])
    .map((student: any) => student?.name || "")
    .filter(Boolean)
    .join(", ");
}

function normalizeClassroomItem(item: any): ClassroomItem {
  return {
    _id: String(item?._id || ""),
    title: String(item?.title || "Untitled classroom"),
    classroomType: item?.classroomType === "series" ? "series" : "single",
    status: item?.status === "ongoing" || item?.status === "completed" || item?.status === "cancelled" ? item.status : "scheduled",
    courseName: item?.courseName ? String(item.courseName) : "",
    course: item?.course || "",
    levelName: item?.levelName ? String(item.levelName) : "",
    topicName: item?.topicName ? String(item.topicName) : "",
    classDate: item?.classDate || undefined,
    startDate: item?.startDate || undefined,
    endDate: item?.endDate || undefined,
    startTime: item?.startTime ? String(item.startTime) : "",
    durationMinutes: Number(item?.durationMinutes || 60),
    frequency: item?.frequency === "custom" ? "custom" : "weekly",
    sessionsPerWeek: Number(item?.sessionsPerWeek || 1),
    daysOfWeek: Array.isArray(item?.daysOfWeek) ? item.daysOfWeek : [],
    endCondition: ["on_date", "after_n_sessions", "course_complete", "never"].includes(item?.endCondition) ? item.endCondition : "course_complete",
    endAfterSessions: Number(item?.endAfterSessions || 0) || undefined,
    seriesTopicMode: item?.seriesTopicMode === "selected" || /^\d+ selected topics$/i.test(String(item?.topicName || "")) ? "selected" : "all",
    sessionPlan: Array.isArray(item?.sessionPlan) ? item.sessionPlan : [],
    coach: item?.coach || "",
    students: Array.isArray(item?.students) ? item.students : [],
    batches: Array.isArray(item?.batches) ? item.batches : [],
    generatedSessions: Array.isArray(item?.generatedSessions) ? item.generatedSessions : [],
    meetingProvider: item?.meetingProvider === "meet" ? "meet" : undefined,
    meetingUrl: item?.meetingUrl ? String(item.meetingUrl) : "",
    isTestClassroom: Boolean(item?.isTestClassroom),
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

function flattenScheduleSlots(days: Array<{ day: number; slots: Array<{ startTime: string; durationMinutes: number }> }>) {
  return days.flatMap((day) =>
    (day.slots || []).map((slot) => ({
      day: day.day,
      slots: [{ startTime: slot.startTime || "16:00", durationMinutes: slot.durationMinutes || 60 }],
    }))
  );
}

function actionTitle(type: string) {
  if (type === "reschedule_class") return "Reschedule Class";
  if (type === "shift_future_sessions") return "Just break";
  if (type === "permanent_schedule_change") return "Permanent Timing Change";
  if (type === "cancel_class") return "Cancel Class";
  if (type === "cancel_series") return "Cancel Entire Series";
  if (type === "update_session") return "Edit This Class";
  if (type === "reschedule_session") return "Reschedule This Class";
  if (type === "cancel_session") return "Cancel This Class";
  if (type === "delete_session") return "Delete This Class";
  if (type === "substitute_coach") return "Substitute Coach";
  if (type === "add_extra_class") return "Add Extra Class";
  if (type === "mark_session_outcome") return "Correct Class Outcome";
  if (type === "change_session_topic") return "Change Class Topic";
  return "Update Class";
}

function actionConfirmLabel(type: string) {
  if (type === "cancel_series") return "Cancel Entire Series";
  if (type === "cancel_class" || type === "cancel_session") return "Cancel Class";
  if (type === "delete_session") return "Delete Class";
  if (type === "reschedule_class" || type === "reschedule_session") return "Reschedule";
  if (type === "shift_future_sessions") return "Shift Future Classes";
  if (type === "permanent_schedule_change") return "Update Permanent Timing";
  if (type === "update_session") return "Save Class";
  if (type === "mark_session_outcome") return "Save Outcome";
  if (type === "change_session_topic") return "Save Topic";
  return "Apply";
}

function actionCanSubmit(type: string, draft: any) {
  if (type === "substitute_coach") return Boolean(String(draft?.coach || "").trim());
  if (type === "reschedule_class" || type === "reschedule_session") return Boolean(draft?.classDate && draft?.startTime);
  if (type === "shift_future_sessions") return Boolean(draft?.restartDate);
  if (type === "permanent_schedule_change") {
    const days = Array.isArray(draft?.daysOfWeek) ? draft.daysOfWeek : [];
    return Boolean(
      draft?.effectiveDate &&
      days.length &&
      days.every((day: any) => Array.isArray(day?.slots) && day.slots[0]?.startTime)
    );
  }
  if (type === "update_session") return Boolean(String(draft?.topicName || "").trim() && draft?.classDate && draft?.startTime);
  if (type === "change_session_topic") return Boolean(String(draft?.topicName || "").trim());
  if (type === "add_extra_class") return Boolean(String(draft?.topicName || "").trim() && draft?.classDate && draft?.startTime);
  if (type === "mark_session_outcome") return Boolean(String(draft?.classOutcome || "").trim());
  return true;
}

function actionSuccessMessage(type: string) {
  if (type === "cancel_series") return "Series cancelled";
  if (type === "cancel_class" || type === "cancel_session") return "Class cancelled";
  if (type === "delete_session") return "Class deleted from the series";
  if (type === "reschedule_class" || type === "reschedule_session") return "Class rescheduled";
  if (type === "shift_future_sessions") return "Future classes shifted";
  if (type === "permanent_schedule_change") return "Permanent timing updated";
  if (type === "update_session") return "Class updated";
  if (type === "add_extra_class") return "Extra class added";
  if (type === "substitute_coach") return "Coach assignment updated";
  if (type === "mark_session_outcome") return "Class outcome updated";
  if (type === "change_session_topic") return "Class topic updated";
  return "Class updated";
}
