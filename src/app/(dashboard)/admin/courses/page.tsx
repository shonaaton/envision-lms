"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronDown, Plus, Save, Search, Trash2 } from "lucide-react";
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

const blankCourse: Course = {
  name: "Beginner Course",
  category: "Chess Foundation",
  level: "beginner",
  description: "",
  isActive: true,
  levels: [
    {
      name: "Beginner Level 1",
      sessionCount: 4,
      description: "",
      topics: [
        { name: "Board, files, ranks, and coordinates", sessionCount: 1 },
        { name: "How pieces move", sessionCount: 2 },
        { name: "Check and checkmate basics", sessionCount: 1 },
      ],
    },
  ],
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<Course>(blankCourse);
  const [query, setQuery] = useState("");
  const [openLevels, setOpenLevels] = useState<Record<number, boolean>>({ 0: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/courses${query ? `?q=${encodeURIComponent(query)}` : ""}`);
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

  const totalSessions = useMemo(() => draft.levels.reduce((sum, level) => sum + Number(level.sessionCount || 0), 0), [draft.levels]);
  const totalTopics = useMemo(() => draft.levels.reduce((sum, level) => sum + (level.topics?.length || 0), 0), [draft.levels]);

  function updateDraft(update: Partial<Course>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function updateLevel(index: number, update: Partial<CourseLevel>) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, levelIndex) => (levelIndex === index ? { ...level, ...update } : level)),
    }));
  }

  function updateTopic(levelIndex: number, topicIndex: number, update: Partial<Topic>) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, index) =>
        index === levelIndex
          ? { ...level, topics: level.topics.map((topic, tIndex) => (tIndex === topicIndex ? { ...topic, ...update } : topic)) }
          : level
      ),
    }));
  }

  function addLevel() {
    setDraft((current) => ({
      ...current,
      levels: [...current.levels, { name: `Level ${current.levels.length + 1}`, sessionCount: 1, description: "", topics: [] }],
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
        index === levelIndex
          ? { ...level, topics: [...level.topics, { name: `Topic ${level.topics.length + 1}`, sessionCount: 1 }] }
          : level
      ),
    }));
  }

  function removeTopic(levelIndex: number, topicIndex: number) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, index) =>
        index === levelIndex ? { ...level, topics: level.topics.filter((_, tIndex) => tIndex !== topicIndex) } : level
      ),
    }));
  }

  async function saveCourse() {
    if (!draft.name.trim()) return toast.error("Course name is required");
    setSaving(true);
    const response = await fetch(draft._id ? `/api/admin/courses/${draft._id}` : "/api/admin/courses", {
      method: draft._id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not save course");
    setDraft(cloneCourse(data));
    setCourses((current) => [data, ...current.filter((course) => course._id !== data._id)]);
    toast.success("Course saved");
  }

  async function deleteCourse() {
    if (!draft._id) return setDraft(blankCourse);
    if (!window.confirm(`Delete ${draft.name}?`)) return;
    const response = await fetch(`/api/admin/courses/${draft._id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete course");
    setCourses((current) => current.filter((course) => course._id !== draft._id));
    setDraft(blankCourse);
    toast.success("Course deleted");
  }

  return (
    <div className="h-[calc(100vh-92px)] min-h-[640px] overflow-hidden text-slate-950">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <BookOpenCheck size={14} />
            Administration
          </div>
          <h1 className="mt-2 text-2xl font-black text-brand">Courses</h1>
          <p className="text-sm text-slate-600">Create course hierarchies with levels, topics, and planned session counts.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-brand/10 bg-white p-3 shadow-xl shadow-brand/10">
          <Stat label="Courses" value={courses.length} />
          <Stat label="Levels" value={draft.levels.length} />
          <Stat label="Sessions" value={totalSessions} />
        </div>
      </div>

      <div className="grid h-[calc(100%-104px)] min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-brand/10 bg-white p-3 shadow-xl shadow-brand/10">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && load()}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand"
              placeholder="Search courses..."
            />
          </div>
          <button onClick={() => setDraft(blankCourse)} className="mb-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white">
            <Plus size={16} /> New Course
          </button>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {loading && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading courses...</div>}
            {!loading && courses.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No courses yet.</div>}
            {courses.map((course) => (
              <button
                key={course._id}
                onClick={() => setDraft(cloneCourse(course))}
                className={cn("w-full rounded-xl border p-3 text-left transition", draft._id === course._id ? "border-brand bg-brand/10" : "border-slate-200 bg-white hover:border-brand/30")}
              >
                <div className="font-bold text-slate-950">{course.name}</div>
                <div className="mt-1 text-xs text-slate-500">{course.level} - {course.totalSessions || 0} sessions</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-xl shadow-brand/10">
          <div className="flex flex-none flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-[1.2fr_160px_170px]">
              <input className="input h-10" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Course name" />
              <select className="input h-10" value={draft.level} onChange={(event) => updateDraft({ level: event.target.value as Course["level"] })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="mixed">Mixed</option>
              </select>
              <input className="input h-10" value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })} placeholder="Category" />
              <textarea className="input min-h-16 md:col-span-3" value={draft.description || ""} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Course description" />
            </div>
            <div className="flex gap-2">
              <button onClick={saveCourse} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-60"><Save size={16} /> Save</button>
              <button onClick={deleteCourse} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700"><Trash2 size={16} /></button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-black text-slate-950">Course Structure</h2>
                <p className="text-sm text-slate-500">{draft.levels.length} levels - {totalTopics} topics - {totalSessions} sessions</p>
              </div>
              <button onClick={addLevel} className="inline-flex h-9 items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3 text-sm font-bold text-brand"><Plus size={15} /> Add Level</button>
            </div>
            <div className="space-y-3">
              {draft.levels.map((level, levelIndex) => (
                <div key={levelIndex} className="rounded-2xl border border-slate-200 bg-slate-50">
                  <button
                    onClick={() => setOpenLevels((current) => ({ ...current, [levelIndex]: !current[levelIndex] }))}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-slate-950">{level.name || `Level ${levelIndex + 1}`}</div>
                      <div className="text-xs text-slate-500">{level.topics.length} topics - {level.sessionCount} sessions</div>
                    </div>
                    <ChevronDown className={cn("text-slate-500 transition", openLevels[levelIndex] ? "rotate-180" : "")} size={18} />
                  </button>
                  {openLevels[levelIndex] !== false && (
                    <div className="border-t border-slate-200 p-3">
                      <div className="grid gap-2 md:grid-cols-[1fr_130px_44px]">
                        <input className="input h-10" value={level.name} onChange={(event) => updateLevel(levelIndex, { name: event.target.value })} placeholder="Level name" />
                        <input className="input h-10" type="number" min={1} value={level.sessionCount} onChange={(event) => updateLevel(levelIndex, { sessionCount: Number(event.target.value || 1) })} />
                        <button onClick={() => removeLevel(levelIndex)} className="grid h-10 place-items-center rounded-lg border border-red-200 bg-white text-red-600"><Trash2 size={15} /></button>
                        <textarea className="input min-h-14 md:col-span-3" value={level.description || ""} onChange={(event) => updateLevel(levelIndex, { description: event.target.value })} placeholder="Level description" />
                      </div>
                      <div className="mt-3 space-y-2">
                        {level.topics.map((topic, topicIndex) => (
                          <div key={topicIndex} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 md:grid-cols-[1fr_120px_40px]">
                            <input className="input h-9" value={topic.name} onChange={(event) => updateTopic(levelIndex, topicIndex, { name: event.target.value })} placeholder="Topic name" />
                            <input className="input h-9" type="number" min={1} value={topic.sessionCount} onChange={(event) => updateTopic(levelIndex, topicIndex, { sessionCount: Number(event.target.value || 1) })} />
                            <button onClick={() => removeTopic(levelIndex, topicIndex)} className="grid h-9 place-items-center rounded-lg border border-red-100 text-red-600"><Trash2 size={14} /></button>
                            <input className="input h-9 md:col-span-3" value={topic.description || ""} onChange={(event) => updateTopic(levelIndex, topicIndex, { description: event.target.value })} placeholder="Topic description or teaching note" />
                          </div>
                        ))}
                        <button onClick={() => addTopic(levelIndex)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"><Plus size={14} /> Add Topic</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-brand">{value}</div>
    </div>
  );
}
