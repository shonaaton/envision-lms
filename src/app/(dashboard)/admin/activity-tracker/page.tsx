import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Activity } from "@/models/Activity";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";
import { ActivitySquare, Filter, Search } from "lucide-react";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?.toString?.() || String(value || "");
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function moduleLabel(type?: string) {
  const safe = String(type || "activity");
  if (safe.includes("attendance")) return "Attendance";
  if (safe.includes("homework")) return "Homework";
  if (safe.includes("pgn")) return "PGN Library";
  if (safe.includes("booking")) return "Self Booking";
  if (safe.includes("payment") || safe.includes("invoice")) return "Fees";
  if (safe.includes("user")) return "Users";
  if (safe.includes("coach")) return "Ask Coach";
  if (safe.includes("square")) return "Square Trainer";
  return "General";
}

function activityContext(item: any, batchNames: string) {
  const metadata = item.metadata || {};
  const parts = [
    metadata.courseName ? `Course: ${metadata.courseName}` : "",
    metadata.batchName && !batchNames.includes(String(metadata.batchName)) ? `Batch: ${metadata.batchName}` : "",
    typeof metadata.records === "number" ? `${metadata.records} records` : "",
    typeof metadata.totalScore === "number" ? `Score: ${metadata.totalScore}` : "",
    typeof metadata.accuracy === "number" ? `Accuracy: ${metadata.accuracy}%` : "",
    item.entityType ? String(item.entityType) : "",
  ].filter(Boolean);
  return parts.join(" · ") || batchNames || "-";
}

export default async function ActivityTrackerPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    userType?: string;
    userId?: string;
    batch?: string;
    course?: string;
    type?: string;
    from?: string;
    to?: string;
  };
}) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");
  await dbConnect();

  const q = String(searchParams.q || "").trim().toLowerCase();
  const userType = String(searchParams.userType || "");
  const userId = String(searchParams.userId || "");
  const batchId = String(searchParams.batch || "");
  const courseName = String(searchParams.course || "");
  const activityType = String(searchParams.type || "");
  const from = searchParams.from ? new Date(String(searchParams.from)) : null;
  const to = searchParams.to ? new Date(String(searchParams.to)) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const [activities, users, batches, courses] = await Promise.all([
    Activity.find({
      ...(activityType ? { type: activityType } : {}),
      ...(from || to ? { occurredAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
    })
      .populate("actor", "name username email role batches")
      .populate("targetUser", "name username email role batches")
      .sort({ occurredAt: -1 })
      .limit(500)
      .lean(),
    User.find({ isActive: { $ne: false } }, { name: 1, username: 1, email: 1, role: 1, batches: 1 }).sort({ name: 1 }).lean(),
    Batch.find({ isActive: { $ne: false } }, { name: 1 }).sort({ name: 1 }).lean(),
    Course.find({ isActive: { $ne: false } }, { name: 1 }).sort({ name: 1 }).lean(),
  ]);

  const batchNameById = new Map(batches.map((batch: any) => [objectId(batch._id), batch.name]));

  const filtered = activities.filter((item: any) => {
    const actor = item.actor || null;
    const target = item.targetUser || null;
    const relatedRoles = [actor?.role, target?.role].filter(Boolean);
    const relatedUserIds = [actor?._id, target?._id].map(objectId).filter(Boolean);
    const actorBatchIds = [...(actor?.batches || []), ...(target?.batches || [])].map(objectId);
    const actorBatchNames = actorBatchIds.map((id) => batchNameById.get(id)).filter(Boolean);
    const haystack = [
      item.label,
      item.type,
      actor?.name,
      actor?.username,
      actor?.email,
      target?.name,
      target?.username,
      target?.email,
      ...(actorBatchNames || []),
      item.metadata?.courseName,
      item.metadata?.batchName,
    ].filter(Boolean).join(" ").toLowerCase();

    if (q && !haystack.includes(q)) return false;
    if (userType && !relatedRoles.includes(userType)) return false;
    if (userId && !relatedUserIds.includes(userId)) return false;
    if (batchId && !actorBatchIds.includes(batchId)) return false;
    if (courseName && String(item.metadata?.courseName || "").trim() !== courseName) return false;
    return true;
  });

  const activityTypes = Array.from(new Set(activities.map((item: any) => item.type).filter(Boolean))).sort();
  const userOptions: Array<[string, string]> = [["", "All users"], ...users.map((user: any) => [objectId(user._id), `${user.name} (${user.role})`] as [string, string])];
  const batchOptions: Array<[string, string]> = [["", "All batches"], ...batches.map((batch: any) => [objectId(batch._id), batch.name] as [string, string])];
  const courseOptions: Array<[string, string]> = [["", "All courses"], ...courses.map((course: any) => [course.name, course.name] as [string, string])];
  const activityTypeOptions: Array<[string, string]> = [["", "All activities"], ...activityTypes.map((type) => [type, type] as [string, string])];

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-xl border border-brand/10 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-brand/70">Administration</div>
            <h1 className="mt-0.5 flex items-center gap-2 text-xl font-black text-brand"><ActivitySquare size={21} /> Activity Tracker</h1>
            <p className="mt-0.5 text-xs text-slate-600">Monitor users, attendance, homework, fees, classrooms, and chess tools.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total Records" value={filtered.length} />
            <Stat label="Admins" value={filtered.filter((item: any) => [item.actor?.role, item.targetUser?.role].includes("admin")).length} />
            <Stat label="Coaches" value={filtered.filter((item: any) => [item.actor?.role, item.targetUser?.role].includes("instructor")).length} />
            <Stat label="Students" value={filtered.filter((item: any) => [item.actor?.role, item.targetUser?.role].includes("student")).length} />
          </div>
        </div>
      </section>

      <form className="rounded-xl border border-brand/10 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-brand"><Filter size={14} /> Filters</div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Search</div>
            <div className="mt-0.5 flex items-center gap-2">
              <Search size={15} className="text-slate-400" />
              <input name="q" defaultValue={searchParams.q || ""} className="w-full bg-transparent text-xs outline-none" placeholder="User, batch, course, activity" />
            </div>
          </label>
          <SelectFilter name="userType" label="User Type" defaultValue={userType} options={[["", "All"], ["admin", "Admin"], ["instructor", "Coach"], ["student", "Student"]]} />
          <SelectFilter name="userId" label="User" defaultValue={userId} options={userOptions} />
          <SelectFilter name="batch" label="Batch" defaultValue={batchId} options={batchOptions} />
          <SelectFilter name="course" label="Course" defaultValue={courseName} options={courseOptions} />
          <SelectFilter name="type" label="Activity Type" defaultValue={activityType} options={activityTypeOptions} />
          <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">From</div>
            <input type="date" name="from" defaultValue={searchParams.from || ""} className="mt-0.5 w-full bg-transparent text-xs outline-none" />
          </label>
          <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">To</div>
            <input type="date" name="to" defaultValue={searchParams.to || ""} className="mt-0.5 w-full bg-transparent text-xs outline-none" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="h-8 rounded-lg bg-purple-700 px-3 text-xs font-semibold text-white">Apply Filters</button>
          <a href="/admin/activity-tracker" className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">Reset</a>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border border-brand/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-sm font-black text-slate-950">Activity Log</div>
            <div className="text-xs text-slate-500">Showing {filtered.length} of {activities.length} recent records</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-2.5">User</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Activity</th>
                <th className="px-3 py-2.5">Module</th>
                <th className="px-3 py-2.5">Context</th>
                <th className="px-3 py-2.5">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any) => {
                const actor = item.actor || item.targetUser || {};
                const actorBatchIds = [...(actor.batches || [])].map(objectId);
                const batchNames = actorBatchIds.map((id) => batchNameById.get(id)).filter(Boolean).join(", ");
                return (
                  <tr key={objectId(item._id)} className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-950">{actor.name || "System"}</div>
                      <div className="text-xs text-slate-500">{actor.username || actor.email || "-"}</div>
                    </td>
                    <td className="px-3 py-2.5 capitalize">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{actor.role || "-"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-950">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.type}</div>
                    </td>
                    <td className="px-3 py-2.5">{moduleLabel(item.type)}</td>
                    <td className="max-w-[260px] px-3 py-2.5 text-xs text-slate-600">{activityContext(item, batchNames)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{formatDateTime(item.occurredAt)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">No activity records match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-12 min-w-28 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="text-lg font-black text-brand">{value}</div>
    </div>
  );
}

function SelectFilter({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <select name={name} defaultValue={defaultValue} className="mt-0.5 w-full bg-transparent text-xs outline-none">
        {options.map(([value, text]) => <option key={`${name}-${value || "all"}`} value={value}>{text}</option>)}
      </select>
    </label>
  );
}
