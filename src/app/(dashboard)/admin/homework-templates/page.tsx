import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Clock3, FileText, Link2Off, Plus, Search } from "lucide-react";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { dbConnect } from "@/lib/db";
import { AssignmentAutomationLog, AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Course } from "@/models/Course";
import { ImportHomeworkPgnButton, UploadTemplateButton } from "@/components/homework/AssignmentTemplateActions";
import TemplateBulkMove, { type MoveCourse, type TemplateRow } from "@/components/homework/TemplateBulkMove";
import "@/models/Batch";
import "@/models/Classroom";
import "@/models/Homework";
import "@/models/PGN";

export const dynamic = "force-dynamic";

// Sentinel for "this field is empty", so an unfiled template is reachable from
// the same dropdown as the filed ones - those are exactly the rows a course
// rename leaves behind.
const NO_VALUE = "__none__";

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function badgeClass(status: string) {
  if (status === "linked" || status === "assigned") return "bg-emerald-50 text-emerald-700";
  if (status === "needs_review" || status === "ambiguous_template") return "bg-amber-50 text-amber-700";
  if (status.includes("missing") || status.includes("skipped") || status === "unlinked") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function activitySummary(template: any) {
  const activities = template.activities || [];
  if (!activities.length) return "No activities";
  return activities
    .map((activity: any) => {
      const count = Array.isArray(activity.items) ? activity.items.length : 0;
      const sourceKind = activity.source?.kind;
      const label =
        sourceKind === "fen_mcq" ? "FEN + MCQ"
        : sourceKind === "fen_written_answer" ? "FEN + Written"
        : activity.type === "quiz" ? "MCQ"
        : activity.type === "written_answer" ? "Written Answer"
        : activity.type === "study_pgn" ? "PGN Homework"
        : activity.type === "play_computer" ? "Play vs Computer"
        : String(activity.type || "activity").replaceAll("_", " ");
      return `${label}${count ? ` (${count})` : ""}`;
    })
    .join(", ");
}

function duePolicySummary(template: any) {
  return template.duePolicy?.type === "days_after_class"
    ? `${template.duePolicy.daysAfterClass || 7} days after class`
    : `${template.duePolicy?.minutesBefore ?? 1} min before next class`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Filters = { q: string; course: string; level: string; courseIds: string[] };

function templateFilter({ q, course, level, courseIds }: Filters) {
  const filter: Record<string, any> = { isActive: { $ne: false } };
  const and: any[] = [];
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    and.push({ $or: [{ title: regex }, { topicName: regex }, { courseName: regex }, { levelName: regex }] });
  }
  if (course === NO_VALUE) {
    // A template can carry the course id, the name, or neither. Unfiled means
    // neither, so both have to be empty.
    and.push({ courseName: { $in: ["", null] }, course: null });
  } else if (course) {
    const or: any[] = [{ courseName: course }];
    if (courseIds.length) or.push({ course: { $in: courseIds } });
    and.push({ $or: or });
  }
  if (level === NO_VALUE) and.push({ levelName: { $in: ["", null] } });
  else if (level) and.push({ levelName: level });
  if (and.length) filter.$and = and;
  return filter;
}

function pageHref(page: number, { q, course, level }: { q: string; course: string; level: string }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (course) params.set("course", course);
  if (level) params.set("level", level);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/homework-templates?${query}` : "/admin/homework-templates";
}

function sortedUnique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <span className="text-brand">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

export default async function HomeworkTemplatesPage({ searchParams }: { searchParams?: { q?: string; page?: string; course?: string; level?: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !(await canAccessFeature("homeworkTemplates", session.user as any, "view"))) redirect("/dashboard");
  await dbConnect();

  const q = String(searchParams?.q || "").trim();
  const course = String(searchParams?.course || "").trim();
  const level = String(searchParams?.level || "").trim();
  const page = Math.max(1, Number(searchParams?.page || 1));
  const pageSize = 25;
  const canMove = role === "instructor" ? true : await canAccessFeature("homeworkTemplates", session.user as any, "edit");

  // Only the level names are needed here - projecting whole levels would drag
  // every topic of every course into a page that never shows them.
  const allCourses: any[] = await Course.find({}, { name: 1, level: 1, "levels.name": 1 }).sort({ name: 1 }).lean();
  const courseIds = course && course !== NO_VALUE
    ? allCourses.filter((item: any) => String(item.name || "").trim() === course).map((item: any) => String(item._id))
    : [];
  const filters: Filters = { q, course, level, courseIds };
  const filter = templateFilter(filters);
  // The level list is scoped to the chosen course, so picking a course narrows
  // the levels instead of listing every level in the academy.
  const levelScopeFilter = templateFilter({ q: "", course, level: "", courseIds });

  const [templates, totalTemplates, allActiveTemplates, courseNamesInUse, levelNamesInScope, logs] = await Promise.all([
    AssignmentTemplate.find(filter)
      .populate("course", "name")
      .populate("defaultBatches", "name")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    AssignmentTemplate.countDocuments(filter),
    AssignmentTemplate.find({ isActive: { $ne: false } }, { isActive: 1, linkStatus: 1 }).lean(),
    AssignmentTemplate.distinct("courseName", { isActive: { $ne: false } }),
    AssignmentTemplate.distinct("levelName", levelScopeFilter),
    AssignmentAutomationLog.find({})
      .populate("classroom", "title")
      .populate("sourceTemplate", "title")
      .populate("homework", "title")
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
  ]);

  const selectedCourseDocs = courseIds.length ? allCourses.filter((item: any) => courseIds.includes(String(item._id))) : allCourses;
  // The active filter value is always an option, even when nothing matches it
  // any more - otherwise the dropdown would sit on "All" while the URL still
  // filters, and the empty table would look like a bug.
  const courseOptions = sortedUnique([...allCourses.map((item: any) => item.name), ...courseNamesInUse, course === NO_VALUE ? "" : course]);
  // Course levels and level names already on templates are unioned, so a level
  // that was renamed on the course is still selectable while its templates
  // still carry the old name.
  const levelOptions = sortedUnique([
    ...selectedCourseDocs.flatMap((item: any) => (item.levels || []).map((courseLevel: any) => courseLevel?.name)),
    ...levelNamesInScope,
    level === NO_VALUE ? "" : level,
  ]);
  const moveCourses: MoveCourse[] = allCourses.map((item: any) => ({
    id: String(item._id),
    name: String(item.name || "Untitled course"),
    levels: sortedUnique((item.levels || []).map((courseLevel: any) => courseLevel?.name)),
  }));

  const rows: TemplateRow[] = templates.map((template: any) => ({
    id: String(template._id),
    title: template.title,
    subtitle: `${template.source?.kind || "manual"} - ${template.autoAssign ? "auto on" : "auto off"}`,
    courseName: template.course?.name || template.courseName || "",
    levelName: template.levelName || template.level || "",
    topicName: template.topicName,
    activities: activitySummary(template),
    linkStatus: String(template.linkStatus || "unlinked"),
    duePolicy: duePolicySummary(template),
  }));

  const activeCount = allActiveTemplates.filter((template: any) => template.isActive).length;
  const linkedCount = allActiveTemplates.filter((template: any) => template.linkStatus === "linked").length;
  const reviewCount = allActiveTemplates.filter((template: any) => template.linkStatus !== "linked").length;
  const missingCount = logs.filter((log: any) => ["missing_template", "ambiguous_template"].includes(log.status)).length;
  const totalPages = Math.max(1, Math.ceil(totalTemplates / pageSize));
  const hasFilters = Boolean(q || course || level);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Homework Assignment Templates</div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Assignment Templates</h1>
          <p className="mt-1 text-sm text-slate-500">Assign a template manually to students or batches, or link it to course topics for automatic assignment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/instructor/homework/templates/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-black text-white"><Plus size={16} /> Create Template</Link>
          <UploadTemplateButton />
          <ImportHomeworkPgnButton />
        </div>
      </header>

      <section className="mb-5 grid gap-3 md:grid-cols-4">
        <StatCard label="Active Templates" value={activeCount} icon={<BookOpenCheck size={18} />} />
        <StatCard label="Linked" value={linkedCount} icon={<CheckCircle2 size={18} />} />
        <StatCard label="Needs Review" value={reviewCount} icon={<AlertTriangle size={18} />} />
        <StatCard label="Recent Missing" value={missingCount} icon={<Link2Off size={18} />} />
      </section>

      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand" />
            <div>
              <h2 className="text-lg font-black text-slate-950">Templates</h2>
              <p className="text-xs text-slate-500">{totalTemplates} shown by current filters</p>
            </div>
          </div>
          <form className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_200px_200px_auto_auto]">
            <span className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <Search size={15} className="text-slate-400" />
              <input name="q" defaultValue={q} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search template, topic, course, level" />
            </span>
            <select name="course" defaultValue={course} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <option value="">All courses</option>
              <option value={NO_VALUE}>No course set</option>
              {courseOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select name="level" defaultValue={level} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <option value="">All levels</option>
              <option value={NO_VALUE}>No level set</option>
              {levelOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <button className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-black text-white">Apply</button>
            {hasFilters && <Link href="/admin/homework-templates" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Clear</Link>}
          </form>
        </div>

        <TemplateBulkMove rows={rows} courses={moveCourses} canMove={canMove} />

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="font-semibold text-slate-500">Page {page} of {totalPages}</div>
          <div className="flex flex-wrap gap-2">
            <Link href={pageHref(Math.max(1, page - 1), filters)} className={`rounded-lg border border-slate-200 px-3 py-2 font-bold ${page <= 1 ? "pointer-events-none text-slate-300" : "text-slate-700"}`}>Previous</Link>
            <Link href={pageHref(Math.min(totalPages, page + 1), filters)} className={`rounded-lg border border-slate-200 px-3 py-2 font-bold ${page >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-700"}`}>Next</Link>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Clock3 size={18} className="text-brand" />
          <h2 className="text-lg font-black text-slate-950">Recent Automation Events</h2>
        </div>
        <div className="space-y-2">
          {logs.map((log: any) => (
            <div key={String(log._id)} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[180px_1fr_160px] md:items-center">
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(log.status)}`}>{String(log.status).replaceAll("_", " ")}</span>
              <div>
                <div className="font-semibold text-slate-950">{log.message || log.topicName || "Automation event"}</div>
                <div className="text-xs text-slate-500">{log.classroom?.title || "Classroom"} - {log.sourceTemplate?.title || "No template"} - {log.homework?.title || "No homework"}</div>
              </div>
              <div className="text-xs text-slate-500">{formatDate(log.createdAt)}</div>
            </div>
          ))}
          {!logs.length && <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No automation events yet.</div>}
        </div>
      </section>
    </div>
  );
}
