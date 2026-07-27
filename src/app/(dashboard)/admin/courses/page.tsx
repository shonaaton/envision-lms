"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, ChevronDown, Download, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Topic = { name: string; sessionCount: number; description?: string; order?: number };
type CourseLevel = { name: string; sessionCount: number; description?: string; order?: number; topics: Topic[] };
type Course = {
  _id?: string;
  name: string;
  description?: string;
  category: string;
  level: "beginner" | "intermediate" | "advanced" | "mixed";
  totalSessions?: number;
  levels: CourseLevel[];
  isActive: boolean;
};

const templateRows = [
  ["main_course", "sub_level", "topic", "course_category", "course_level"],
  ["Beginner Course", "Beginner Level 1", "Board, files, ranks, and coordinates", "Chess Foundation", "beginner"],
  ["Beginner Course", "Beginner Level 1", "How pieces move", "Chess Foundation", "beginner"],
  ["Beginner Course", "Beginner Level 2", "Check and checkmate basics", "Chess Foundation", "beginner"],
];

const levelTemplateRows = [
  ["main_course", "sub_level", "topic"],
  ["Beginner Course", "Beginner Level 2", "Basic checkmates"],
  ["Beginner Course", "Beginner Level 2", "Mate in one puzzles"],
];

const blankCourse: Course = {
  name: "",
  category: "",
  level: "beginner",
  description: "",
  isActive: true,
  levels: [],
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<Course>(blankCourse);
  const [query, setQuery] = useState("");
  const [openLevels, setOpenLevels] = useState<Record<number, boolean>>({ 0: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const courseFileInputRef = useRef<HTMLInputElement | null>(null);
  const levelFileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/courses${query ? `?q=${encodeURIComponent(query)}` : ""}`, { cache: "no-store" });
    if (!response.ok) {
      toast.error("Could not load courses");
      setLoading(false);
      return;
    }
    const list = await response.json();
    setCourses(list);
    if (!draft._id && list[0]) setDraft(cloneCourse(list[0]));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSessions = useMemo(() => draft.levels.reduce((sum, level) => sum + level.topics.length, 0), [draft.levels]);
  const totalTopics = useMemo(() => draft.levels.reduce((sum, level) => sum + (level.topics?.length || 0), 0), [draft.levels]);

  function updateDraft(update: Partial<Course>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function updateLevel(index: number, update: Partial<CourseLevel>) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, levelIndex) => (levelIndex === index ? { ...level, ...update, sessionCount: level.topics.length } : level)),
    }));
  }

  function updateTopic(levelIndex: number, topicIndex: number, update: Partial<Topic>) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, index) =>
        index === levelIndex
          ? { ...level, topics: level.topics.map((topic, tIndex) => (tIndex === topicIndex ? { ...topic, ...update, sessionCount: 1 } : topic)), sessionCount: level.topics.length }
          : level
      ),
    }));
  }

  function addLevel() {
    setDraft((current) => ({
      ...current,
      levels: [...current.levels, { name: `Level ${current.levels.length + 1}`, sessionCount: 0, description: "", topics: [] }],
    }));
    setOpenLevels((current) => ({ ...current, [draft.levels.length]: true }));
  }

  function removeLevel(index: number) {
    setDraft((current) => ({ ...current, levels: current.levels.filter((_, levelIndex) => levelIndex !== index) }));
  }

  function addTopic(levelIndex: number) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, index) =>
        index === levelIndex ? { ...level, topics: [...level.topics, { name: `Class ${level.topics.length + 1}`, sessionCount: 1 }], sessionCount: level.topics.length + 1 } : level
      ),
    }));
  }

  function removeTopic(levelIndex: number, topicIndex: number) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, index) =>
        index === levelIndex ? { ...level, topics: level.topics.filter((_, tIndex) => tIndex !== topicIndex), sessionCount: Math.max(0, level.topics.length - 1) } : level
      ),
    }));
  }

  async function saveCourse() {
    if (!draft.name.trim()) return toast.error("Main course name is required");
    const existingCourse = !draft._id ? findCourseByName(courses, draft.name) : null;
    const targetCourse = existingCourse ? mergeCourses(existingCourse, draft) : draft;
    setSaving(true);
    const response = await fetch(targetCourse._id ? `/api/admin/courses/${targetCourse._id}` : "/api/admin/courses", {
      method: targetCourse._id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(targetCourse),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not save course");
    setDraft(cloneCourse(data));
    setCourses((current) => [data, ...current.filter((course) => course._id !== data._id)]);
    toast.success(existingCourse ? "Course updated and merged" : "Course saved");
  }

  async function deleteCourse() {
    if (!draft._id) return setDraft(cloneCourse(blankCourse));
    if (!window.confirm(`Delete ${draft.name}?`)) return;
    const response = await fetch(`/api/admin/courses/${draft._id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete course");
    setCourses((current) => current.filter((course) => course._id !== draft._id));
    setDraft(cloneCourse(blankCourse));
    toast.success("Course deleted");
  }

  function downloadTemplate() {
    const csv = templateRows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "course-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadLevelTemplate() {
    const csv = levelTemplateRows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "course-level-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseCourseCsv(text);
      const baseCourse =
        draft._id || normalizeKey(draft.name) === normalizeKey(imported.name)
          ? draft
          : findCourseByName(courses, imported.name);
      const nextDraft = baseCourse ? mergeCourses(baseCourse, imported) : imported;
      setDraft(nextDraft);
      setOpenLevels(Object.fromEntries(nextDraft.levels.map((_, index) => [index, index === 0])));
      toast.success(baseCourse ? "Imported and merged into the open course. Review it, then press Save." : "Course imported. Review it, then press Save.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import CSV");
    } finally {
      if (courseFileInputRef.current) courseFileInputRef.current.value = "";
    }
  }

  async function importLevels(file?: File) {
    if (!file) return;
    if (!draft.name.trim()) {
      toast.error("Open a course first, then import levels into it.");
      if (levelFileInputRef.current) levelFileInputRef.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      const imported = parseCourseCsv(text);
      if (normalizeKey(imported.name) !== normalizeKey(draft.name)) {
        throw new Error(`This file is for "${imported.name}". Open the matching main course first.`);
      }
      const nextDraft = mergeCourses(draft, imported);
      setDraft(nextDraft);
      setOpenLevels(Object.fromEntries(nextDraft.levels.map((_, index) => [index, true])));
      toast.success("Levels imported into the current course. Press Save to keep them.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import levels");
    } finally {
      if (levelFileInputRef.current) levelFileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[560px] flex-col overflow-hidden text-slate-950">
      <div className="mb-3 flex flex-none flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brand">
            <BookOpenCheck size={14} />
            Course Planner
          </div>
          <h1 className="mt-1 text-2xl font-black text-brand">Courses</h1>
          <p className="text-sm text-slate-600">Main course, sub levels, and topics as actual classes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SummaryPill label="Courses" value={courses.length} />
          <SummaryPill label="Levels" value={draft.levels.length} />
          <SummaryPill label="Classes" value={totalTopics} />
          <SummaryPill label="Sessions" value={totalSessions} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-xl border border-brand/10 bg-white/95 p-3 shadow-lg shadow-brand/5">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && load()}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand"
              placeholder="Search courses..."
            />
          </div>
          <button onClick={() => setDraft(cloneCourse(blankCourse))} className="mb-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-bold text-white">
            <Plus size={15} /> New Course
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={downloadTemplate} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700">
              <Download size={14} /> Course CSV
            </button>
            <button onClick={() => courseFileInputRef.current?.click()} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-brand/20 bg-brand/5 text-xs font-bold text-brand">
              <Upload size={14} /> Import Course
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={downloadLevelTemplate} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700">
              <Download size={14} /> Level CSV
            </button>
            <button onClick={() => levelFileInputRef.current?.click()} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-brand/20 bg-brand/5 text-xs font-bold text-brand">
              <Upload size={14} /> Import Level
            </button>
          </div>
          <input ref={courseFileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => importCsv(event.target.files?.[0])} />
          <input ref={levelFileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => importLevels(event.target.files?.[0])} />

          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {loading && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Loading courses...</div>}
            {!loading && courses.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No courses yet.</div>}
            {courses.map((course) => (
              <button
                key={course._id}
                onClick={() => setDraft(cloneCourse(course))}
                className={cn("w-full rounded-lg border p-3 text-left transition", draft._id === course._id ? "border-brand bg-brand/10" : "border-slate-200 bg-white hover:border-brand/30")}
              >
                <div className="truncate text-sm font-black text-slate-950">{course.name}</div>
                <div className="mt-1 text-xs text-slate-500">{course.level} - {course.totalSessions || 0} classes</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-brand/10 bg-white/95 shadow-lg shadow-brand/5">
          <div className="flex flex-none flex-col gap-2 border-b border-slate-200 p-3">
            <div className="grid gap-2 lg:grid-cols-[1fr_160px_180px_auto_auto]">
              <input className="input h-9" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Main course name" />
              <select className="input h-9" value={draft.level} onChange={(event) => updateDraft({ level: event.target.value as Course["level"] })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="mixed">Mixed</option>
              </select>
              <input className="input h-9" value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })} placeholder="Category" />
              <button onClick={saveCourse} disabled={saving} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-60">
                <Save size={15} /> Save
              </button>
              <button onClick={deleteCourse} className="grid h-9 place-items-center rounded-lg border border-red-200 bg-red-50 px-3 text-red-700">
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-none items-center justify-between border-b border-slate-100 px-3 py-2">
              <div>
                <h2 className="text-sm font-black text-slate-950">Structure</h2>
                <p className="text-xs text-slate-500">Main course - sub levels - topics/classes</p>
              </div>
              <button onClick={addLevel} className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand/20 bg-brand/5 px-3 text-xs font-bold text-brand">
                <Plus size={14} /> Add Level
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="space-y-2">
                {draft.levels.map((level, levelIndex) => (
                  <div key={levelIndex} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <button
                      onClick={() => setOpenLevels((current) => ({ ...current, [levelIndex]: !current[levelIndex] }))}
                      className="flex w-full items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-slate-950">{level.name || `Level ${levelIndex + 1}`}</div>
                        <div className="text-xs text-slate-500">{level.topics.length} classes</div>
                      </div>
                      <ChevronDown className={cn("text-slate-500 transition", openLevels[levelIndex] ? "rotate-180" : "")} size={17} />
                    </button>

                    {openLevels[levelIndex] !== false && (
                      <div className="space-y-2 p-3">
                        <div className="grid gap-2 lg:grid-cols-[1fr_90px_36px]">
                          <input className="input h-9" value={level.name} onChange={(event) => updateLevel(levelIndex, { name: event.target.value })} placeholder="Sub level name" />
                          <div className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700">{level.topics.length}</div>
                          <button onClick={() => removeLevel(levelIndex)} className="grid h-9 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                          <div className="mb-2 grid grid-cols-[1fr_90px_36px] gap-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                            <span>Topic / actual class</span>
                            <span>Class</span>
                            <span />
                          </div>
                          <div className="space-y-2">
                            {level.topics.map((topic, topicIndex) => (
                              <div key={topicIndex} className="grid gap-2 rounded-lg border border-white bg-white p-2 shadow-sm lg:grid-cols-[1fr_90px_36px]">
                                <input className="input h-8 border-0 bg-transparent px-1 shadow-none focus:bg-white" value={topic.name} onChange={(event) => updateTopic(levelIndex, topicIndex, { name: event.target.value })} placeholder="Topic/class name" />
                                <div className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700">1</div>
                                <button onClick={() => removeTopic(levelIndex, topicIndex)} className="grid h-8 place-items-center rounded-md border border-red-100 bg-red-50 text-red-600">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                            <button onClick={() => addTopic(levelIndex)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
                              <Plus size={13} /> Add Class
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function cloneCourse(course: Course): Course {
  return JSON.parse(JSON.stringify(course));
}

function normalizeKey(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function findCourseByName(courses: Course[], name: string) {
  const key = normalizeKey(name);
  return courses.find((course) => normalizeKey(course.name) === key) || null;
}

function mergeCourses(existingCourse: Course, incomingCourse: Course): Course {
  const mergedLevels = [...existingCourse.levels.map(cloneCourseLevel)];

  incomingCourse.levels.forEach((incomingLevel) => {
    const existingLevelIndex = mergedLevels.findIndex((level) => normalizeKey(level.name) === normalizeKey(incomingLevel.name));
    if (existingLevelIndex === -1) {
      mergedLevels.push(cloneCourseLevel(incomingLevel));
      return;
    }
    mergedLevels[existingLevelIndex] = mergeLevels(mergedLevels[existingLevelIndex], incomingLevel);
  });

  const finalizedLevels = mergedLevels.map((level, index) => ({
    ...level,
    order: index,
    sessionCount: level.topics.length,
  }));

  return {
    ...existingCourse,
    name: incomingCourse.name || existingCourse.name,
    description: incomingCourse.description || existingCourse.description,
    category: incomingCourse.category || existingCourse.category,
    level: incomingCourse.level || existingCourse.level,
    isActive: incomingCourse.isActive ?? existingCourse.isActive,
    levels: finalizedLevels,
    totalSessions: finalizedLevels.reduce((sum, level) => sum + level.topics.length, 0),
  };
}

function mergeLevels(existingLevel: CourseLevel, incomingLevel: CourseLevel): CourseLevel {
  const mergedTopics = [...existingLevel.topics.map(cloneTopic)];
  incomingLevel.topics.forEach((incomingTopic) => {
    const existingTopicIndex = mergedTopics.findIndex((topic) => normalizeKey(topic.name) === normalizeKey(incomingTopic.name));
    if (existingTopicIndex === -1) {
      mergedTopics.push(cloneTopic(incomingTopic));
      return;
    }
    mergedTopics[existingTopicIndex] = {
      ...mergedTopics[existingTopicIndex],
      ...incomingTopic,
      name: incomingTopic.name || mergedTopics[existingTopicIndex].name,
      description: incomingTopic.description || mergedTopics[existingTopicIndex].description,
      sessionCount: 1,
      order: existingTopicIndex,
    };
  });

  const finalizedTopics = mergedTopics.map((topic, index) => ({ ...topic, order: index }));

  return {
    ...existingLevel,
    name: incomingLevel.name || existingLevel.name,
    description: incomingLevel.description || existingLevel.description,
    topics: finalizedTopics,
    sessionCount: finalizedTopics.length,
  };
}

function cloneCourseLevel(level: CourseLevel): CourseLevel {
  return {
    ...level,
    topics: level.topics.map(cloneTopic),
  };
}

function cloneTopic(topic: Topic): Topic {
  return { ...topic };
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-xl border border-brand/10 bg-white px-3 py-2 text-center shadow-lg shadow-brand/5">
      <div className="text-lg font-black leading-none text-brand">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function csvEscape(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseCourseCsv(text: string): Course {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV needs at least one topic row.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const required = ["main_course", "sub_level", "topic"];
  for (const header of required) {
    if (!headers.includes(header)) throw new Error(`Missing column: ${header}`);
  }
  const get = (row: string[], name: string) => row[headers.indexOf(name)] || "";
  const dataRows = rows.slice(1).filter((row) => get(row, "main_course") && get(row, "sub_level") && get(row, "topic"));
  if (!dataRows.length) throw new Error("No valid course rows found.");

  const first = dataRows[0];
  const course: Course = {
    name: get(first, "main_course"),
    category: get(first, "course_category") || "General",
    level: parseCourseLevel(get(first, "course_level")),
    description: get(first, "description"),
    isActive: true,
    levels: [],
  };

  const levelMap = new Map<string, CourseLevel>();
  dataRows.forEach((row) => {
    const levelName = get(row, "sub_level");
    if (!levelMap.has(levelName)) {
      const level = { name: levelName, sessionCount: 0, description: "", topics: [] };
      levelMap.set(levelName, level);
      course.levels.push(level);
    }
    const level = levelMap.get(levelName)!;
    level.topics.push({ name: get(row, "topic"), sessionCount: 1, description: "" });
    level.sessionCount = level.topics.length;
  });

  course.totalSessions = course.levels.reduce((sum, level) => sum + level.topics.length, 0);
  return course;
}

function parseCourseLevel(value: string): Course["level"] {
  const normalized = value.toLowerCase();
  return normalized === "intermediate" || normalized === "advanced" || normalized === "mixed" ? normalized : "beginner";
}
