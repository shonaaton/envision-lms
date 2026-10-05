import Link from "next/link";
import { redirect } from "next/navigation";
import { isValidObjectId } from "mongoose";
import { ArrowLeft, CalendarClock, GraduationCap, Languages, UserRound, Users } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { CoachProfileForm } from "@/components/coach-pay/CoachProfileForm";
import { formatHours } from "@/lib/hours";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import {
  LEVEL_GROUPS,
  availabilityByDay,
  formatTime,
  levelLabel,
  levelsByTier,
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

/** "Beginner L1, L2" per tier: compact enough for a table cell. */
function LevelList({ levels }: { levels: string[] }) {
  const groups = levelsByTier(levels);
  if (!groups.length) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="grid gap-0.5 text-xs text-slate-700">
      {groups.map((group) => (
        <div key={group.tier} className="whitespace-nowrap">
          <span className="font-semibold text-slate-900">{group.label}</span>{" "}
          {group.levels.length === 3 ? "all levels" : group.levels.map((level) => level.short).join(", ")}
        </div>
      ))}
    </div>
  );
}

/** Read-only view of one coach's profile. */
function ProfileSummary({ profile }: { profile: CoachProfileView }) {
  const days = availabilityByDay(profile.availability);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1fr_2fr]">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Levels they can take</div>
        <div className="mt-2">
          {profile.levels.length ? <LevelList levels={profile.levels} /> : <p className="text-sm text-slate-400">Not added yet</p>}
        </div>
      </div>
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

  // The admin team keeps these profiles; coaches no longer fill in their own.
  if (!viewer.canViewAll) redirect("/coach-pay");
  const canEdit = viewer.role === "admin" || viewer.role === "sub-admin";

  // Admins: every coach's profile, filterable by language and level, with one opened below.
  const languageFilter = value(params, "language");
  const requestedLevel = value(params, "level");
  const levelFilter = LEVEL_GROUPS.some((group) => group.levels.some((level) => level.key === requestedLevel)) ? requestedLevel : "";
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
  const visible = rows
    .filter((row) => !languageFilter || row.profile.languages.some((language) => language.toLowerCase() === languageFilter.toLowerCase()))
    .filter((row) => !levelFilter || row.profile.levels.includes(levelFilter));
  const selected = rows.find((row) => row.id === selectedId) || null;
  const filled = rows.filter((row) => row.profile.updatedAt).length;
  const withTimes = rows.filter((row) => row.profile.availability.length > 0).length;
  const withLevels = rows.filter((row) => row.profile.levels.length > 0).length;

  const href = (next: Record<string, string>) => {
    const query = new URLSearchParams();
    const merged = { language: languageFilter, level: levelFilter, coach: selectedId, ...next };
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
        subtitle="Languages, course levels and weekly free times for every coach. The admin team keeps these up to date; coaches cannot change them."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Coaches" value={rows.length} note="Active coaches and anyone with a profile" icon={Users} tone="blue" />
          <StatCard label="Profiles filled in" value={filled} note={`${rows.length - filled} still to fill in`} icon={UserRound} tone="green" />
          <StatCard label="With levels set" value={withLevels} note={`${rows.length - withLevels} without levels`} icon={GraduationCap} tone="green" />
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
          {canEdit && (
            <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3" open={!selected.profile.updatedAt}>
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
        subtitle={
          languageFilter || levelFilter
            ? `${visible.length} ${visible.length === 1 ? "coach" : "coaches"}${languageFilter ? ` who teach in ${languageFilter}` : ""}${levelFilter ? ` who can take ${levelLabel(levelFilter)}` : ""}`
            : "Pick a coach to see their full profile"
        }
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
        <form method="get" action="/coach-pay/profile" className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="level-filter" className="font-semibold text-slate-500">
            Can take level:
          </label>
          {languageFilter && <input type="hidden" name="language" value={languageFilter} />}
          <select id="level-filter" name="level" defaultValue={levelFilter} className="input h-8 w-56 py-0 text-xs">
            <option value="">Any level</option>
            {LEVEL_GROUPS.map((group) => (
              <optgroup key={group.tier} label={group.label}>
                {group.levels.map((level) => (
                  <option key={level.key} value={level.key}>
                    {level.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="submit" className="btn-outline h-8 px-3 text-xs">
            Show
          </button>
          {levelFilter && (
            <Link href={href({ level: "" })} className="font-semibold text-slate-500 underline">
              Clear level
            </Link>
          )}
        </form>
        {visible.length === 0 ? (
          <EmptyState title="No coaches match" description="Try another language or level, or clear the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Coach</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Languages</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Levels</th>
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
                      <td className="px-3 py-2">
                        <LevelList levels={row.profile.levels} />
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
                          {canEdit ? "View / edit" : "View"}
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
