"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, Edit3, ExternalLink, FileText, MoreHorizontal, Plus, Search, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminV2Card, AdminV2Modal, AdminV2Sheet, AdminV2Stat } from "./AdminV2Primitives";
import { cn } from "@/lib/utils";

type ClassroomRow = {
  classroom_id: string;
  title: string;
  topic: string;
  batch_id: string;
  batch_name: string;
  status: string;
  start_time: string;
  session_id: string;
  live_url: string;
  summary_url: string;
  coach_name: string;
  student_count: number;
  attendance_status: "pending" | "completed";
  students: Array<{ student_id: string; name: string; email?: string }>;
};
type CourseCard = {
  course_id: string;
  name: string;
  category: string;
  level: string;
  total_sessions: number;
  level_count: number;
  topic_count: number;
  linked_batches: number;
};
type TemplateCard = {
  template_id: string;
  title: string;
  course_level: string;
  course_name: string;
  topic_name: string;
  pgn_source: string;
  source_kind: string;
  auto_assign_policy: string;
  link_status: string;
  activities_count: number;
  updated_at: string;
  edit_url: string;
  preview_url: string;
};

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function csvDownload(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function AdminV2AcademicsClient() {
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [tab, setTab] = useState<"classrooms" | "courses" | "homework">("classrooms");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [batch, setBatch] = useState("");
  const [menuClassroom, setMenuClassroom] = useState("");
  const [attendanceClassroom, setAttendanceClassroom] = useState<ClassroomRow | null>(null);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin-v2/academics", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Could not load academics hub");
      setLoading(false);
      return;
    }
    setClassrooms(data.classrooms || []);
    setCourses(data.courses || []);
    setTemplates(data.templates || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const batches = useMemo(() => Array.from(new Map(classrooms.filter((item) => item.batch_id).map((item) => [item.batch_id, item.batch_name])).entries()), [classrooms]);

  const filteredClassrooms = useMemo(() => {
    const term = query.trim().toLowerCase();
    return classrooms.filter((item) => {
      if (batch && item.batch_id !== batch) return false;
      if (date && item.start_time.slice(0, 10) !== date) return false;
      if (!term) return true;
      return [item.title, item.topic, item.batch_name, item.coach_name, item.status].join(" ").toLowerCase().includes(term);
    });
  }, [batch, classrooms, date, query]);

  const filteredCourses = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((item) => [item.name, item.category, item.level].join(" ").toLowerCase().includes(term));
  }, [courses, query]);

  const filteredTemplates = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((item) => [item.title, item.course_name, item.course_level, item.topic_name, item.source_kind].join(" ").toLowerCase().includes(term));
  }, [query, templates]);

  async function cancelClassroom(item: ClassroomRow) {
    if (!window.confirm(`Cancel ${item.title}?`)) return;
    const response = await fetch(`/api/classrooms/${item.classroom_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", isActive: false }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not cancel classroom");
    toast.success("Classroom cancelled");
    await load();
  }

  function exportClassrooms() {
    csvDownload("admin-v2-classrooms.csv", [
      ["Classroom", "Topic", "Batch", "Coach", "Status", "Start Time", "Students", "Attendance"],
      ...filteredClassrooms.map((item) => [item.title, item.topic, item.batch_name, item.coach_name, item.status, item.start_time, String(item.student_count), item.attendance_status]),
    ]);
  }

  return (
    <div className="space-y-4">
      <AdminV2Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">Academics</div>
            <h2 className="mt-1 text-2xl font-black text-brand">Classroom Setup, Curriculum & Homework</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <AdminV2Stat label="Classrooms" value={classrooms.length} />
            <AdminV2Stat label="Courses" value={courses.length} />
            <AdminV2Stat label="Templates" value={templates.length} tone="accent" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["classrooms", "Classrooms"],
            ["courses", "Course Catalog"],
            ["homework", "Homework Templates"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)} className={cn("rounded-md px-4 py-2 text-sm font-black transition", tab === id ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-brand/5 hover:text-brand")}>{label}</button>
          ))}
        </div>
      </AdminV2Card>

      <AdminV2Card>
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_170px_180px_auto_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input className="input h-10 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search academics" />
          </label>
          <input className="input h-10" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={tab !== "classrooms"} />
          <select className="input h-10" value={batch} onChange={(event) => setBatch(event.target.value)} disabled={tab !== "classrooms"}>
            <option value="">All batches</option>
            {batches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button className="btn-outline h-10" onClick={exportClassrooms} disabled={tab !== "classrooms"}><Download size={16} /> Export</button>
          <button className="btn-primary h-10" onClick={() => tab === "homework" ? setTemplateDialog(true) : window.location.assign(tab === "courses" ? "/admin/courses" : "/classrooms")}>
            <Plus size={16} /> {tab === "homework" ? "Create Template" : "Create"}
          </button>
        </div>
      </AdminV2Card>

      {tab === "classrooms" ? (
        <AdminV2Card className="overflow-visible p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3">Classroom</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Live</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClassrooms.map((item) => (
                  <tr key={`${item.classroom_id}-${item.session_id}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-950">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.topic} - {item.coach_name} - {item.student_count} students</div>
                    </td>
                    <td className="px-4 py-3">{item.batch_name}</td>
                    <td className="px-4 py-3">{formatDateTime(item.start_time)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", item.status === "completed" ? "bg-emerald-50 text-emerald-700" : item.status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-brand/5 text-brand")}>{item.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={item.live_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-xs font-black text-brand shadow-sm hover:brightness-95">
                        <ExternalLink size={15} /> Join Live
                      </a>
                    </td>
                    <td className="relative px-4 py-3 text-right">
                      <button onClick={() => setMenuClassroom(menuClassroom === item.classroom_id ? "" : item.classroom_id)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:border-brand/30 hover:text-brand">
                        <MoreHorizontal size={17} />
                      </button>
                      {menuClassroom === item.classroom_id ? (
                        <div className="absolute right-4 top-12 z-30 w-56 rounded-md border border-brand/10 bg-white p-2 text-left shadow-xl shadow-brand/15">
                          <MenuLink href={item.summary_url} icon={<Edit3 size={15} />}>Edit Details</MenuLink>
                          <MenuLink href="/classrooms" icon={<Users size={15} />}>Assign Participants</MenuLink>
                          <MenuButton icon={<CalendarDays size={15} />} onClick={() => { setAttendanceClassroom(item); setMenuClassroom(""); }}>Mark Attendance</MenuButton>
                          <MenuButton danger icon={<XCircle size={15} />} onClick={() => void cancelClassroom(item)}>Cancel Classroom</MenuButton>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!loading && !filteredClassrooms.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No classrooms match the current filters.</td></tr> : null}
                {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Loading academics...</td></tr> : null}
              </tbody>
            </table>
          </div>
        </AdminV2Card>
      ) : null}

      {tab === "courses" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredCourses.map((course) => (
            <article key={course.course_id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-brand">{course.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{course.category}</div>
                </div>
                <span className="rounded-full bg-brand/5 px-2.5 py-1 text-xs font-black text-brand">{course.level}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniStat label="Levels" value={course.level_count} />
                <MiniStat label="Topics" value={course.topic_count} />
                <MiniStat label="Batches" value={course.linked_batches} />
              </div>
              <a href="/admin/courses" className="btn-outline mt-4 w-full">Open Course Planner</a>
            </article>
          ))}
        </div>
      ) : null}

      {tab === "homework" ? (
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
          {filteredTemplates.map((template) => (
            <article key={template.template_id} className="mb-4 break-inside-avoid rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-accent/30 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-brand">{template.source_kind === "pgn_import" ? "PGN" : template.source_kind === "mcq_import" ? "JSON" : "Manual"}</span>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide", template.link_status === "linked" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{template.link_status}</span>
              </div>
              <h3 className="mt-3 text-lg font-black text-slate-950">{template.title}</h3>
              <div className="mt-1 text-sm text-slate-500">{template.course_name || "No course"} - {template.course_level || "No level"}</div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{template.topic_name}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniStat label="Activities" value={template.activities_count} />
                <MiniStat label="Policy" value={template.auto_assign_policy} />
              </div>
              <div className="mt-4 flex gap-2">
                <a href={template.preview_url} className="btn-outline flex-1"><FileText size={16} /> Preview</a>
                <a href={template.edit_url} className="btn-primary flex-1"><Edit3 size={16} /> Edit</a>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <AttendanceSheet classroom={attendanceClassroom} onClose={() => setAttendanceClassroom(null)} onSaved={load} />
      <CreateTemplateDialog open={templateDialog} onClose={() => setTemplateDialog(false)} />
    </div>
  );
}

function MenuButton({ children, icon, onClick, danger = false }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold hover:bg-brand/5", danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:text-brand")}>{icon}{children}</button>;
}

function MenuLink({ children, icon, href }: { children: React.ReactNode; icon: React.ReactNode; href: string }) {
  return <a href={href} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-brand/5 hover:text-brand">{icon}{children}</a>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-brand">{value}</div>
    </div>
  );
}

function AttendanceSheet({ classroom, onClose, onSaved }: { classroom: ClassroomRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [records, setRecords] = useState<Array<{ student: string; status: "present" | "absent" }>>([]);
  useEffect(() => {
    setRecords((classroom?.students || []).map((student) => ({ student: student.student_id, status: "present" as const })));
  }, [classroom]);

  async function save() {
    if (!classroom) return;
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classroom: classroom.classroom_id,
        sessionId: classroom.session_id,
        sessionDate: classroom.start_time,
        records,
        coachStatus: "present",
        classOutcome: "completed",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not mark attendance");
    toast.success("Attendance saved");
    onClose();
    await onSaved();
  }

  return (
    <AdminV2Sheet open={!!classroom} title="Mark Attendance" description={classroom?.title} onClose={onClose}>
      <div className="space-y-3">
        {(classroom?.students || []).map((student) => {
          const record = records.find((item) => item.student === student.student_id);
          const present = record?.status === "present";
          return (
            <div key={student.student_id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div>
                <div className="font-black text-slate-950">{student.name}</div>
                <div className="text-xs text-slate-500">{student.email || "No email"}</div>
              </div>
              <button
                onClick={() => setRecords((current) => current.map((item) => item.student === student.student_id ? { ...item, status: present ? "absent" : "present" } : item))}
                className={cn("h-8 w-16 rounded-full p-1 transition", present ? "bg-brand" : "bg-slate-300")}
              >
                <span className={cn("block h-6 w-6 rounded-full bg-white transition", present && "translate-x-8")} />
              </button>
            </div>
          );
        })}
        {!classroom?.students?.length ? <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No enrolled students found for this classroom.</div> : null}
        <button className="btn-primary mt-4" onClick={() => void save()}><CalendarDays size={16} /> Save Attendance</button>
      </div>
    </AdminV2Sheet>
  );
}

function CreateTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <AdminV2Modal open={open} title="Create Template" description="Fast input accepts a topic brief or Lichess workspace link." onClose={onClose}>
      <div className="space-y-3">
        <textarea className="input min-h-40" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste a Lichess study link or describe the homework template to create..." />
        <div className="rounded-md border border-accent/60 bg-accent/20 p-3 text-sm font-semibold text-brand">
          This pilot captures the unified input flow. Template generation still routes through the existing template builder for final creation.
        </div>
        <a href={`/instructor/homework/templates/new${value ? `?seed=${encodeURIComponent(value)}` : ""}`} className="btn-primary w-fit">
          Continue in Template Builder
        </a>
      </div>
    </AdminV2Modal>
  );
}

