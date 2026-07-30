import { redirect } from "next/navigation";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Clock3, FileText, Link2Off } from "lucide-react";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { AssignmentAutomationLog, AssignmentTemplate } from "@/models/AssignmentTemplate";
import { DeactivateTemplateButton, ImportHomeworkPgnButton } from "@/components/homework/AssignmentTemplateActions";
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
      return `${String(activity.type || "activity").replaceAll("_", " ")}${count ? ` (${count})` : ""}`;
    })
    .join(", ");
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

export default async function HomeworkTemplatesPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "admin") redirect("/dashboard");
  await dbConnect();

  const [templates, logs] = await Promise.all([
    AssignmentTemplate.find({})
      .populate("course", "name")
      .populate("defaultBatches", "name")
      .sort({ isActive: -1, updatedAt: -1 })
      .limit(300)
      .lean(),
    AssignmentAutomationLog.find({})
      .populate("classroom", "title")
      .populate("sourceTemplate", "title")
      .populate("homework", "title")
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
  ]);

  const activeCount = templates.filter((template: any) => template.isActive).length;
  const linkedCount = templates.filter((template: any) => template.linkStatus === "linked").length;
  const reviewCount = templates.filter((template: any) => template.linkStatus !== "linked").length;
  const missingCount = logs.filter((log: any) => ["missing_template", "ambiguous_template"].includes(log.status)).length;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Homework Automation</div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Assignment Templates</h1>
          <p className="mt-1 text-sm text-slate-500">Auto-assigned templates linked to course topics, batches, and scheduled class deadlines.</p>
        </div>
        <ImportHomeworkPgnButton />
      </header>

      <section className="mb-5 grid gap-3 md:grid-cols-4">
        <StatCard label="Active Templates" value={activeCount} icon={<BookOpenCheck size={18} />} />
        <StatCard label="Linked" value={linkedCount} icon={<CheckCircle2 size={18} />} />
        <StatCard label="Needs Review" value={reviewCount} icon={<AlertTriangle size={18} />} />
        <StatCard label="Recent Missing" value={missingCount} icon={<Link2Off size={18} />} />
      </section>

      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-brand" />
          <h2 className="text-lg font-black text-slate-950">Templates</h2>
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
                  <td className="px-3 py-3"><DeactivateTemplateButton id={String(template._id)} /></td>
                </tr>
              ))}
              {!templates.length && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">No templates yet. Upload PGNs with HW in the file name, then import them here.</td></tr>
              )}
            </tbody>
          </table>
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
