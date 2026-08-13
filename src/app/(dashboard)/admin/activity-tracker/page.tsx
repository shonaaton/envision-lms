import { auth } from "@/lib/auth";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Activity } from "@/models/Activity";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";
import {
  ActivitySquare,
  ArrowLeft,
  ArrowRight,
  Download,
  Filter,
  Search,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  userType?: string;
  userId?: string;
  batch?: string;
  course?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: string;
};

function objectId(value: any) {
  return value?.toString?.() || String(value || "");
}

function value(params: SearchParams, key: keyof SearchParams) {
  return String(params[key] || "");
}

function cleanParams(params: SearchParams, overrides: Record<string, string | number | undefined> = {}) {
  const next = new URLSearchParams();
  (["q", "userType", "userId", "batch", "course", "type", "from", "to"] as Array<keyof SearchParams>).forEach((key) => {
    const current = String(overrides[key] ?? params[key] ?? "");
    if (current) next.set(key, current);
  });
  Object.entries(overrides).forEach(([key, current]) => {
    if (!["q", "userType", "userId", "batch", "course", "type", "from", "to"].includes(key) && current !== undefined && current !== "") {
      next.set(key, String(current));
    }
  });
  return next;
}

function pageHref(params: SearchParams, page: number) {
  const next = cleanParams(params, { page });
  return `/admin/activity-tracker?${next.toString()}`;
}

function exportHref(params: SearchParams, format: "csv" | "xls") {
  const next = cleanParams(params, { format });
  return `/api/admin/activity-tracker/export?${next.toString()}`;
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
  if (safe.includes("classroom")) return "Classrooms";
  if (safe.includes("homework")) return "Homework";
  if (safe.includes("pgn")) return "PGN Library";
  if (safe.includes("tournament") || safe.includes("tactics") || safe.includes("king_hunt") || safe.includes("play_vs_computer") || safe.includes("square_trainer")) return "Chess Practice";
  if (safe.includes("booking")) return "Self Booking";
  if (safe.includes("payment") || safe.includes("invoice") || safe.includes("fees") || safe.includes("credit")) return "Fees";
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
    metadata.source ? `Source: ${String(metadata.source).replace(/_/g, " ")}` : "",
    metadata.invoiceNumber ? `Invoice: ${metadata.invoiceNumber}` : "",
    typeof metadata.amount === "number" ? `Amount: ₹${(metadata.amount / 100).toLocaleString("en-IN")}` : "",
    typeof metadata.credits === "number" ? `${metadata.credits > 0 ? "+" : ""}${metadata.credits} credits` : "",
    typeof metadata.balanceAfter === "number" ? `Balance: ${metadata.balanceAfter}` : "",
    metadata.reason ? `Reason: ${metadata.reason}` : "",
    typeof metadata.accuracy === "number" ? `Accuracy: ${metadata.accuracy}%` : "",
    typeof metadata.xp === "number" ? `${metadata.xp} XP` : "",
    typeof metadata.coins === "number" ? `${metadata.coins} coins` : "",
    typeof metadata.timeSeconds === "number" ? `Time: ${metadata.timeSeconds}s` : "",
    typeof metadata.durationSeconds === "number" ? `Duration: ${metadata.durationSeconds}s` : "",
    metadata.solved !== undefined ? `Solved: ${metadata.solved ? "yes" : "no"}` : "",
    metadata.outcome ? `Outcome: ${metadata.outcome}` : "",
    metadata.previousStatus && metadata.status ? `${metadata.previousStatus} -> ${metadata.status}` : "",
    metadata.previousStartTime && metadata.startTime ? `${metadata.previousStartTime} -> ${metadata.startTime}` : "",
    typeof metadata.records === "number" ? `${metadata.records} records` : "",
    typeof metadata.totalScore === "number" ? `Score: ${metadata.totalScore}` : "",
    item.entityType ? String(item.entityType) : "",
  ].filter(Boolean);
  return parts.join(" - ") || batchNames || "-";
}

function activeFilters(params: SearchParams, labels: Record<string, string>) {
  const chips: string[] = [];
  if (params.q) chips.push(`Search: ${params.q}`);
  if (params.userType) chips.push(`Role: ${labels[`role:${params.userType}`] || params.userType}`);
  if (params.userId) chips.push(`User: ${labels[`user:${params.userId}`] || "Selected user"}`);
  if (params.batch) chips.push(`Batch: ${labels[`batch:${params.batch}`] || "Selected batch"}`);
  if (params.course) chips.push(`Course: ${params.course}`);
  if (params.type) chips.push(`Activity: ${params.type}`);
  if (params.from) chips.push(`From: ${params.from}`);
  if (params.to) chips.push(`To: ${params.to}`);
  return chips;
}

export default async function ActivityTrackerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");
  await dbConnect();

  const params = searchParams || {};
  const q = value(params, "q").trim().toLowerCase();
  const userType = value(params, "userType");
  const userId = value(params, "userId");
  const batchId = value(params, "batch");
  const courseName = value(params, "course");
  const activityType = value(params, "type");
  const from = params.from ? new Date(String(params.from)) : null;
  const to = params.to ? new Date(String(params.to)) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const [activities, users, batches, courses] = await Promise.all([
    Activity.find({
      ...(activityType ? { type: activityType } : {}),
      ...(from || to ? { occurredAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
    })
      .populate("actor", "name username email role batches")
      .populate("targetUser", "name username email role batches")
      .sort({ occurredAt: -1 })
      .limit(2000)
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
      ...actorBatchNames,
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

  const page = Math.max(1, Number(params.page || 1) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);
  const rangeStart = filtered.length ? start + 1 : 0;
  const rangeEnd = Math.min(start + PAGE_SIZE, filtered.length);
  const uniqueUsers = new Set(filtered.flatMap((item: any) => [objectId(item.actor?._id), objectId(item.targetUser?._id)]).filter(Boolean)).size;
  const moduleCount = new Set(filtered.map((item: any) => moduleLabel(item.type))).size;

  const activityTypes = Array.from(new Set(activities.map((item: any) => item.type).filter(Boolean))).sort();
  const userOptions: Array<[string, string]> = [["", "All users"], ...users.map((user: any) => [objectId(user._id), `${user.name} (${user.role})`] as [string, string])];
  const batchOptions: Array<[string, string]> = [["", "All batches"], ...batches.map((batch: any) => [objectId(batch._id), batch.name] as [string, string])];
  const courseOptions: Array<[string, string]> = [["", "All courses"], ...courses.map((course: any) => [course.name, course.name] as [string, string])];
  const activityTypeOptions: Array<[string, string]> = [["", "All activities"], ...activityTypes.map((type) => [type, type] as [string, string])];
  const labelLookup = Object.fromEntries([
    ["role:admin", "Admin"],
    ["role:instructor", "Coach"],
    ["role:student", "Student"],
    ...users.map((user: any) => [`user:${objectId(user._id)}`, user.name] as [string, string]),
    ...batches.map((batch: any) => [`batch:${objectId(batch._id)}`, batch.name] as [string, string]),
  ]);
  const chips = activeFilters(params, labelLookup);

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand/70">
              <Sparkles size={14} className="text-amber-400" /> Administration
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-brand">
              <ActivitySquare size={24} /> Activity Tracker
            </h1>
            <p className="mt-1 text-sm text-slate-600">Monitor academy actions without scrolling through one endless list.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Matching Records" value={filtered.length} note={`Page ${currentPage} of ${totalPages}`} />
            <Stat label="Visible Now" value={paged.length} note="25 records per page" />
            <Stat label="People" value={uniqueUsers} note="Users in this view" />
            <Stat label="Modules" value={moduleCount} note="Activity areas" />
          </div>
        </div>
      </section>

      <form className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-brand">
              <Filter size={15} /> Filter Activity
            </div>
            <p className="mt-1 text-xs text-slate-500">Search first, then narrow by role, person, batch, course, activity, or date.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary h-10"><Filter size={15} /> Apply</button>
            <a href="/admin/activity-tracker" className="btn-outline h-10">Reset</a>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 xl:col-span-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Search</div>
            <div className="mt-1 flex items-center gap-2">
              <Search size={15} className="text-slate-400" />
              <input name="q" defaultValue={params.q || ""} className="w-full bg-transparent text-sm outline-none" placeholder="Name, email, batch, course, activity" />
            </div>
          </label>
          <SelectFilter name="userType" label="Role" defaultValue={userType} options={[["", "All roles"], ["admin", "Admin"], ["instructor", "Coach"], ["student", "Student"]]} />
          <SelectFilter name="userId" label="User" defaultValue={userId} options={userOptions} />
          <SelectFilter name="batch" label="Batch" defaultValue={batchId} options={batchOptions} />
          <SelectFilter name="course" label="Course" defaultValue={courseName} options={courseOptions} />
          <SelectFilter name="type" label="Activity" defaultValue={activityType} options={activityTypeOptions} />
          <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">From</div>
            <input type="date" name="from" defaultValue={params.from || ""} className="mt-1 w-full bg-transparent text-sm outline-none" />
          </label>
          <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">To</div>
            <input type="date" name="to" defaultValue={params.to || ""} className="mt-1 w-full bg-transparent text-sm outline-none" />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {chips.length ? chips.map((chip) => (
            <span key={chip} className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{chip}</span>
          )) : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">No filters applied</span>}
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-base font-black text-slate-950">Activity Log</div>
            <div className="text-xs text-slate-500">Showing {rangeStart}-{rangeEnd} of {filtered.length} matching records</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={exportHref(params, "xls")} className="btn-outline h-10"><Download size={15} /> XLS</a>
            <a href={exportHref(params, "csv")} className="btn-outline h-10"><Download size={15} /> CSV</a>
          </div>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {paged.map((item: any) => {
            const actor = item.actor || item.targetUser || {};
            const actorBatchIds = [...(actor.batches || [])].map(objectId);
            const batchNames = actorBatchIds.map((id) => batchNameById.get(id)).filter(Boolean).join(", ");
            return (
              <article key={objectId(item._id)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{actor.name || "System"}</div>
                    <div className="text-xs text-slate-500">{actor.username || actor.email || "-"}</div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold capitalize text-slate-700 ring-1 ring-slate-200">{actor.role || "-"}</span>
                </div>
                <div className="mt-3 font-bold text-slate-950">{item.label}</div>
                <div className="mt-1 text-xs text-slate-500">{item.type}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Info label="Module" value={moduleLabel(item.type)} />
                  <Info label="Time" value={formatDateTime(item.occurredAt)} />
                  <div className="col-span-2"><Info label="Context" value={activityContext(item, batchNames)} /></div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Context</th>
                <th className="px-4 py-3">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item: any) => {
                const actor = item.actor || item.targetUser || {};
                const actorBatchIds = [...(actor.batches || [])].map(objectId);
                const batchNames = actorBatchIds.map((id) => batchNameById.get(id)).filter(Boolean).join(", ");
                return (
                  <tr key={objectId(item._id)} className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-950">{actor.name || "System"}</div>
                      <div className="text-xs text-slate-500">{actor.username || actor.email || "-"}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{actor.role || "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-950">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{moduleLabel(item.type)}</span>
                    </td>
                    <td className="max-w-[300px] px-4 py-3 text-xs leading-5 text-slate-600">{activityContext(item, batchNames)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatDateTime(item.occurredAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {paged.length === 0 && (
          <div className="px-4 py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Search size={18} /></div>
            <div className="mt-3 text-sm font-black text-slate-950">No activity matches these filters</div>
            <p className="mt-1 text-xs text-slate-500">Clear the filters or widen the date range to see more records.</p>
            <a href="/admin/activity-tracker" className="btn-outline mt-4">Reset Filters</a>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-semibold text-slate-500">
            Page {currentPage} of {totalPages} - 25 records per page
          </div>
          <div className="flex gap-2">
            <PaginationLink href={pageHref(params, Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
              <ArrowLeft size={15} /> Previous
            </PaginationLink>
            <PaginationLink href={pageHref(params, Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}>
              Next <ArrowRight size={15} />
            </PaginationLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="min-w-36 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-brand">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
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
    <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <select name={name} defaultValue={defaultValue} className="mt-1 w-full bg-transparent text-sm outline-none">
        {options.map(([optionValue, text]) => <option key={`${name}-${optionValue || "all"}`} value={optionValue}>{text}</option>)}
      </select>
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function PaginationLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) {
    return <span className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-300">{children}</span>;
  }
  return <a href={href} className="btn-outline h-10">{children}</a>;
}
