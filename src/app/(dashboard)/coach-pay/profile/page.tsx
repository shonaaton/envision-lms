import Link from "next/link";
import { isValidObjectId } from "mongoose";
import { ArrowLeft, CalendarClock, Languages, UserRound, Users } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { CoachProfileForm } from "@/components/coach-pay/CoachProfileForm";
import { formatHours } from "@/lib/hours";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import {
  availabilityByDay,
  formatTime,
  toCoachProfileView,
  weeklyAvailableMinutes,
  type CoachProfileView,
} from "@/lib/coachProfile";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { saveCoachProfile } from "../actions";

export const dynamic = "force-dynamic";

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function formatUpdated(iso: string | null) {
  if (!iso) return "Never filled in";
  return `Updated ${new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`;
}

/** Read-only view of a profile: what admins see, and what a coach sees of their own. */
function ProfileSummary({ profile }: { profile: CoachProfileView }) {
  const days = availabilityByDay(profile.availability);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Languages</div>
        {profile.languages.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.languages.map((language) => (
              <span key={language} className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                {language}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Not added yet</p>
        )}
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Available every week (IST)
          {profile.availability.length > 0 && (
            <span className="ml-2 normal-case tracking-normal text-slate-400">{formatHours(weeklyAvailableMinutes(profile.availability))} hours a week</span>
          )}
        </div>
        {days.length ? (
          <dl className="mt-2 grid gap-1 text-sm">
            {days.map((day) => (
              <div key={day.day} className="flex gap-3">
                <dt className="w-24 shrink-0 font-semibold text-slate-800">{day.label}</dt>
                <dd className="text-slate-700">{day.slots.map((slot) => `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`).join(", ")}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-400">No times added yet</p>
        )}
        {profile.availabilityNote && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">{profile.availabilityNote}</p>
        )}
      </div>
    </div>
  );
}

export default async function CoachProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  await dbConnect();

  // A coach's own profile: view it and change it. The subject is the session's
  // user, never the query string.
  if (!viewer.canViewAll) {
    const me: any = await User.findById(viewer.userId).select("name username coachProfile").lean();
    const profile = toCoachProfileView(me);
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="My pay"
          title="My Teaching Profile"
          icon={UserRound}
          subtitle="The languages you teach in and the times you are free to take classes. The academy uses this when assigning batches, demos and substitutions."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
            <ArrowLeft size={14} /> Back to my earnings
          </Link>
        </div>
        <DataPanel className="mt-3" title="What the academy sees" subtitle={formatUpdated(profile.updatedAt)} icon={UserRound}>
          <ProfileSummary profile={profile} />
        </DataPanel>
        <DataPanel className="mt-3" title="Add or change" subtitle="Save when you are done" icon={CalendarClock}>
          <CoachProfileForm
            key={profile.updatedAt || "new"}
            coachId={viewer.userId}
            coachName={me?.name || "You"}
            isSelf
            profile={profile}
            saveAction={saveCoachProfile}
          />
        </DataPanel>
      </div>
    );
  }

  // Admins: every coach's profile, filterable by language, with one opened below.
  const languageFilter = value(params, "language");
  const requestedId = value(params, "coach");
  const selectedId = isValidObjectId(requestedId) ? requestedId : "";
  const people: any[] = await User.find({
    $or: [{ role: "instructor", isActive: true }, { "coachProfile.updatedAt": { $exists: true } }, ...(selectedId ? [{ _id: selectedId }] : [])],
  })
    .select("name username role isActive coachProfile")
    .sort({ name: 1 })
    .lean();
  const rows = people.map((person) => ({
    id: String(person._id),
    name: person.name || person.username || "Coach",
    role: String(person.role || ""),
    isActive: person.isActive !== false,
    profile: toCoachProfileView(person),
  }));

  const allLanguages = Array.from(new Set(rows.flatMap((row) => row.profile.languages))).sort();
  const visible = languageFilter
    ? rows.filter((row) => row.profile.languages.some((language) => language.toLowerCase() === languageFilter.toLowerCase()))
    : rows;
  const selected = rows.find((row) => row.id === selectedId) || null;
  const filled = rows.filter((row) => row.profile.updatedAt).length;
  const withTimes = rows.filter((row) => row.profile.availability.length > 0).length;

  const href = (next: Record<string, string>) => {
    const query = new URLSearchParams();
    const merged = { language: languageFilter, coach: selectedId, ...next };
    Object.entries(merged).forEach(([key, val]) => val && query.set(key, val));
    const text = query.toString();
    return `/coach-pay/profile${text ? `?${text}` : ""}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Coach Pay"
        title="Coach Teaching Profiles"
        icon={Languages}
        subtitle="Languages each coach teaches in and the weekly times they are free to teach, as the coaches entered them."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Coaches" value={rows.length} note="Active coaches and anyone with a profile" icon={Users} tone="blue" />
          <StatCard label="Profiles filled in" value={filled} note={`${rows.length - filled} still to fill in`} icon={UserRound} tone="green" />
          <StatCard label="With available times" value={withTimes} note={`${allLanguages.length} languages between them`} icon={CalendarClock} tone="purple" />
        </div>
      </PageHeader>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/coach-pay" className="btn-outline h-9 px-4 text-xs">
          <ArrowLeft size={14} /> All coach payments
        </Link>
        <Link href={href({ coach: viewer.userId })} className="btn-outline h-9 px-4 text-xs">
          <UserRound size={14} /> My own profile
        </Link>
      </div>

      {selected && (
        <DataPanel
          className="mt-3"
          title={selected.id === viewer.userId ? "My teaching profile" : `${selected.name}'s teaching profile`}
          subtitle={formatUpdated(selected.profile.updatedAt)}
          icon={UserRound}
        >
          <ProfileSummary profile={selected.profile} />
          {(viewer.canManageRates || selected.id === viewer.userId) && (
            <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3" open={selected.id === viewer.userId && !selected.profile.updatedAt}>
              <summary className="cursor-pointer text-sm font-bold text-brand">
                {selected.id === viewer.userId ? "Add or change my profile" : `Change ${selected.name}'s profile`}
              </summary>
              <div className="mt-3">
                <CoachProfileForm
                  key={`${selected.id}:${selected.profile.updatedAt || "new"}`}
                  coachId={selected.id}
                  coachName={selected.name}
                  isSelf={selected.id === viewer.userId}
                  profile={selected.profile}
                  saveAction={saveCoachProfile}
                />
              </div>
            </details>
          )}
          <div className="mt-3">
            <Link href={href({ coach: "" })} className="text-xs font-semibold text-slate-500 underline">
              Close
            </Link>
          </div>
        </DataPanel>
      )}

      <DataPanel
        className="mt-3"
        title="All coaches"
        subtitle={languageFilter ? `${visible.length} who teach in ${languageFilter}` : "Pick a coach to see their full profile"}
        icon={Users}
      >
        {allLanguages.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 font-semibold text-slate-500">Teaches in:</span>
            <Link
              href={href({ language: "" })}
              className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${!languageFilter ? "bg-brand text-white ring-brand" : "bg-white text-slate-700 ring-slate-200"}`}
            >
              Any
            </Link>
            {allLanguages.map((language) => (
              <Link
                key={language}
                href={href({ language })}
                className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${
                  languageFilter.toLowerCase() === language.toLowerCase() ? "bg-brand text-white ring-brand" : "bg-white text-slate-700 ring-slate-200"
                }`}
              >
                {language}
              </Link>
            ))}
          </div>
        )}
        {visible.length === 0 ? (
          <EmptyState title="No coaches match" description="Try another language, or clear the filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Coach</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Languages</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Available (IST)</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Hours / week</th>
                  <th className="border-b border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const days = availabilityByDay(row.profile.availability);
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 align-top last:border-0 hover:bg-brand/[0.03] ${row.id === selectedId ? "bg-brand/[0.05]" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-950">{row.name}</div>
                        <div className="text-xs text-slate-500">
                          {row.role === "instructor" ? "Coach" : row.role === "sub-admin" ? "Sub-admin" : row.role === "admin" ? "Admin" : row.role}
                          {row.isActive ? "" : " - inactive"}
                          {" - "}
                          {formatUpdated(row.profile.updatedAt)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {row.profile.languages.length ? (
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {row.profile.languages.map((language) => (
                              <span key={language} className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                                {language}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {days.length ? (
                          <div className="grid gap-0.5">
                            {days.map((day) => (
                              <div key={day.day} className="whitespace-nowrap">
                                <span className="inline-block w-9 font-semibold text-slate-900">{day.short}</span>
                                {day.slots.map((slot) => `${formatTime(slot.startTime)}-${formatTime(slot.endTime)}`).join(", ")}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                        {row.profile.availabilityNote && <div className="mt-1 max-w-xs text-slate-500">{row.profile.availabilityNote}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {row.profile.availability.length ? formatHours(weeklyAvailableMinutes(row.profile.availability)) : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={href({ coach: row.id })} className="btn-outline h-8 px-3 text-xs">
                          {viewer.canManageRates ? "View / edit" : "View"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>
    </div>
  );
}
