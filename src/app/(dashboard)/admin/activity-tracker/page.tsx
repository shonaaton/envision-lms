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
    const actorRole = actor?.role || target?.role || "";
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
    if (userType && actorRole !== userType) return false;
    if (userId && objectId(actor?._id || target?._id) !== userId) return false;
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
    <div className="space-y-6 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white px-5 py-5 shadow-[0_24px_60px_rgba(90,19,114,0.12)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">Administration</div>
            <h1 className="mt-1 flex items-center gap-3 text-3xl font-black text-brand"><ActivitySquare size={28} /> Activity Tracker</h1>
            <p className="mt-1 text-sm text-slate-600">Monitor platform activity across users, attendance, homework, fees, classrooms, and chess tools.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total Records" value={filtered.length} />
            <Stat label="Admins" value={filtered.filter((item: any) => (item.actor?.role || item.targetUser?.role) === "admin").length} />
            <Stat label="Coaches" value={filtered.filter((item: any) => (item.actor?.role || item.targetUser?.role) === "instructor").length} />
            <Stat label="Students" value={filtered.filter((item: any) => (item.actor?.role || item.targetUser?.role) === "student").length} />
          </div>
        </div>
      </section>

      <form className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-brand"><Filter size={16} /> Filters</div>
        <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-6">
          <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Search</div>
            <div className="mt-1 flex items-center gap-2">
              <Search size={15} className="text-slate-400" />
              <input name="q" defaultValue={searchParams.q || ""} className="w-full bg-transparent text-sm outline-none" placeholder="User, batch, course, activity" />
            </div>
          </label>
          <SelectFilter name="userType" label="User Type" defaultValue={userType} options={[["", "All"], ["admin", "Admin"], ["instructor", "Coach"], ["student", "Student"]]} />
          <SelectFilter name="userId" label="User" defaultValue={userId} options={userOptions} />
          <SelectFilter name="batch" label="Batch" defaultValue={batchId} options={batchOptions} />
          <SelectFilter name="course" label="Course" defaultValue={courseName} options={courseOptions} />
          <SelectFilter name="type" label="Activity Type" defaultValue={activityType} options={activityTypeOptions} />
          <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">From</div>
            <input type="date" name="from" defaultValue={searchParams.from || ""} className="mt-1 w-full bg-transparent text-sm outline-none" />
          </label>
          <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">To</div>
            <input type="date" name="to" defaultValue={searchParams.to || ""} className="mt-1 w-full bg-transparent text-sm outline-none" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary">Apply Filters</button>
          <a href="/admin/activity-tracker" className="btn-outline">Reset</a>
        </div>
      </form>

      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <div className="mb-4 text-lg font-black text-slate-950">Master Activity View</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">User Type</th>
                <th className="px-3 py-3">Activity</th>
                <th className="px-3 py-3">Module</th>
                <th className="px-3 py-3">Date & Time</th>
                <th className="px-3 py-3">Batch</th>
                <th className="px-3 py-3">Metadata</th>
                <th className="px-3 py-3">IP / Session</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any) => {
                const actor = item.actor || item.targetUser || {};
                const actorBatchIds = [...(actor.batches || [])].map(objectId);
                const batchNames = actorBatchIds.map((id) => batchNameById.get(id)).filter(Boolean).join(", ");
                return (
                  <tr key={objectId(item._id)} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-950">{actor.name || "System"}</div>
                      <div className="text-xs text-slate-500">{actor.username || actor.email || "-"}</div>
                    </td>
                    <td className="px-3 py-3 capitalize">{actor.role || "-"}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-950">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.type}</div>
                    </td>
                    <td className="px-3 py-3">{moduleLabel(item.type)}</td>
                    <td className="px-3 py-3">{formatDateTime(item.occurredAt)}</td>
                    <td className="px-3 py-3">{batchNames || "-"}</td>
                    <td className="px-3 py-3">
                      <div className="max-w-[280px] whitespace-pre-wrap break-words text-xs text-slate-600">
                        {item.metadata ? JSON.stringify(item.metadata) : "-"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">Not captured</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">No activity records match the current filters.</td>
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-brand">{value}</div>
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
    <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <select name={name} defaultValue={defaultValue} className="mt-1 w-full bg-transparent text-sm outline-none">
        {options.map(([value, text]) => <option key={`${name}-${value || "all"}`} value={value}>{text}</option>)}
      </select>
    </label>
  );
}
