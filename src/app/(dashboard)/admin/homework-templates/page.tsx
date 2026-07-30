import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Clock3, FileText, Link2Off, Search } from "lucide-react";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { AssignmentAutomationLog, AssignmentTemplate } from "@/models/AssignmentTemplate";
import { ImportHomeworkPgnButton, TemplateRowActions, UploadTemplateButton } from "@/components/homework/AssignmentTemplateActions";
import "@/models/Batch";
import "@/models/Classroom";
import "@/models/Course";
import "@/models/Homework";
import "@/models/PGN";

export const dynamic = "force-dynamic";

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function templateFilter(q: string) {
  const filter: Record<string, any> = { isActive: { $ne: false } };
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: regex }, { topicName: regex }, { courseName: regex }, { levelName: regex }];
  }
  return filter;
}

function pageHref(page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/homework-templates?${query}` : "/admin/homework-templates";
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

export default async function HomeworkTemplatesPage({ searchParams }: { searchParams?: { q?: string; page?: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "admin") redirect("/dashboard");
  await dbConnect();

  const q = String(searchParams?.q || "").trim();
  const page = Math.max(1, Number(searchParams?.page || 1));
  const pageSize = 25;
  const filter = templateFilter(q);

  const [templates, totalTemplates, allActiveTemplates, logs] = await Promise.all([
    AssignmentTemplate.find(filter)
      .populate("course", "name")
      .populate("defaultBatches", "name")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    AssignmentTemplate.countDocuments(filter),
    AssignmentTemplate.find({ isActive: { $ne: false } }, { isActive: 1, linkStatus: 1 }).lean(),
    AssignmentAutomationLog.find({})
      .populate("classroom", "title")
      .populate("sourceTemplate", "title")
      .populate("homework", "title")
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
  ]);

  const activeCount = allActiveTemplates.filter((template: any) => template.isActive).length;
  const linkedCount = allActiveTemplates.filter((template: any) => template.linkStatus === "linked").length;
  const reviewCount = allActiveTemplates.filter((template: any) => template.linkStatus !== "linked").length;
  const missingCount = logs.filter((log: any) => ["missing_template", "ambiguous_template"].includes(log.status)).length;
  const totalPages = Math.max(1, Math.ceil(totalTemplates / pageSize));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Homework Automation</div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Assignment Templates</h1>
          <p className="mt-1 text-sm text-slate-500">Auto-assigned templates linked to course topics, batches, and scheduled class deadlines.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand" />
            <div>
              <h2 className="text-lg font-black text-slate-950">Templates</h2>
              <p className="text-xs text-slate-500">{totalTemplates} shown by current search</p>
            </div>
          </div>
          <form className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
            <span className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <Search size={15} className="text-slate-400" />
              <input name="q" defaultValue={q} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search template, topic, course, level" />
            </span>
            <button className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-black text-white">Search</button>
            {q && <Link href="/admin/homework-templates" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Clear</Link>}
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3">Template</th>
                <th className="px-3 py-3">Course / Level</th>
                <th className="px-3 py-3">Topic</th>
                <th className="px-3 py-3">Activities</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Due Policy</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template: any) => (
                <tr key={String(template._id)} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-950">{template.title}</div>
                    <div className="text-xs text-slate-500">{template.source?.kind || "manual"} - {template.autoAssign ? "auto on" : "auto off"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{template.course?.name || template.courseName || "-"}</div>
                    <div className="text-xs text-slate-500">{template.levelName || template.level || "-"}</div>
                  </td>
                  <td className="px-3 py-3">{template.topicName}</td>
                  <td className="px-3 py-3">{activitySummary(template)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(template.linkStatus)}`}>{template.linkStatus}</span>
                  </td>
                  <td className="px-3 py-3">
                    {template.duePolicy?.type === "days_after_class"
                      ? `${template.duePolicy.daysAfterClass || 7} days after class`
                      : `${template.duePolicy?.minutesBefore ?? 1} min before next class`}
                  </td>
                  <td className="px-3 py-3"><TemplateRowActions id={String(template._id)} /></td>
                </tr>
              ))}
              {!templates.length && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">No templates found. Upload a JSON template or adjust the search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="font-semibold text-slate-500">Page {page} of {totalPages}</div>
          <div className="flex flex-wrap gap-2">
            <Link href={pageHref(Math.max(1, page - 1), q)} className={`rounded-lg border border-slate-200 px-3 py-2 font-bold ${page <= 1 ? "pointer-events-none text-slate-300" : "text-slate-700"}`}>Previous</Link>
            <Link href={pageHref(Math.min(totalPages, page + 1), q)} className={`rounded-lg border border-slate-200 px-3 py-2 font-bold ${page >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-700"}`}>Next</Link>
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
