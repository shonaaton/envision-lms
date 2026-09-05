import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";
import { User } from "@/models/User";
import { Tournament } from "@/models/Tournament";
import TournamentCreateForm from "@/components/tournaments/TournamentCreateForm";
import { redirect } from "next/navigation";
import { Chess } from "chess.js";
import { randomBytes } from "crypto";
import { CURRENT_RULES_VERSION } from "@/lib/tournament/scoring";

export const dynamic = "force-dynamic";

type CreateTournamentState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function combineDateTime(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}:00`);
}

function datedName(name: string, date: Date) {
  return `${name} - ${date.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })} - ${date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

async function createTournament(_: CreateTournamentState, formData: FormData): Promise<CreateTournamentState> {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") {
    return { error: "Only administrators can create tournaments." };
  }
  await dbConnect();
  const fail = (error: string, fieldErrors: Record<string, string> = {}) => ({ error, fieldErrors });

  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").trim() as "swiss" | "arena";
  const startDate = String(formData.get("startDate") || "").trim();
  const startTime = String(formData.get("startTime") || "").trim();
  // Canonical time control is seconds, which can express sub-minute controls.
  // `timeControlMinutes` is still written so historical readers keep working.
  const initialClockSeconds = Math.max(0, Math.round(Number(formData.get("initialClockSeconds") || 0)));
  const legacyMinutes = Math.max(0, Number(formData.get("timeControlMinutes") || 0));
  const resolvedClockSeconds = initialClockSeconds > 0 ? initialClockSeconds : Math.round(legacyMinutes * 60);
  const timeControlMinutes = resolvedClockSeconds / 60;
  const incrementSeconds = Math.max(0, Math.round(Number(formData.get("incrementSeconds") || 0)));
  const arenaDurationMinutes = Math.max(0, Number(formData.get("arenaDurationMinutes") || 0));
  const rounds = Math.max(0, Number(formData.get("rounds") || 0));
  const breakBetweenRoundsMinutes = Math.max(0, Number(formData.get("breakBetweenRoundsMinutes") || 0));
  const rated = formData.get("rated") === "yes";
  const allowBerserk = formData.get("allowBerserk") === "yes";
  const arenaStreaks = formData.get("arenaStreaks") !== "no";
  const chatEnabled = formData.get("chatEnabled") === "yes";
  const lateJoiningAllowed = formData.get("lateJoiningAllowed") !== "no";
  const entryRestrictions = String(formData.get("entryRestrictions") || "").trim();
  const startingPositionType = String(formData.get("startingPositionType") || "normal");
  const customFen = String(formData.get("customFen") || "").trim();
  const initialStatus = String(formData.get("initialStatus") || "registration_open");
  const externalInviteEnabled = formData.get("externalInviteEnabled") === "yes";
  const externalInviteMode = String(formData.get("externalInviteMode") || "private");
  const externalInvitePassword = String(formData.get("externalInvitePassword") || "").trim();
  const externalInviteEntryCode = String(formData.get("externalInviteEntryCode") || "").trim();
  const externalInviteExpiresAt = String(formData.get("externalInviteExpiresAt") || "").trim();

  if (!name) return fail("Tournament name is required.", { name: "Tournament name is required." });
  if (type !== "swiss" && type !== "arena") return fail("Please choose either Swiss or Arena format.", { type: "Choose Swiss or Arena." });
  if (!startDate) return fail("Start date is required.", { startDate: "Start date is required." });
  if (!startTime) return fail("Start time is required.", { startTime: "Start time is required." });
  if (resolvedClockSeconds < 15) return fail("Time control must be at least 15 seconds.", { timeControlMinutes: "Time control must be at least 15 seconds." });
  if (type === "arena" && arenaDurationMinutes < 1) return fail("Arena tournaments need a total duration in minutes.", { arenaDurationMinutes: "Arena duration is required." });
  if (type === "swiss" && rounds < 1) return fail("Swiss tournaments need at least 1 round.", { rounds: "Swiss rounds are required." });
  if (startingPositionType === "custom") {
    if (!customFen) return fail("Please provide a custom FEN for the starting position.", { customFen: "Custom FEN is required." });
    try {
      new Chess(customFen);
    } catch {
      return fail("The custom FEN is not valid.", { customFen: "The custom FEN is not valid." });
    }
  }
  if (!["draft", "created", "registration_open"].includes(initialStatus)) {
    return fail("Choose a valid initial tournament status.");
  }
  if (externalInviteEnabled && !["public", "private", "password", "entry_code"].includes(externalInviteMode)) {
    return fail("Choose a valid external invitation mode.");
  }
  if (externalInviteEnabled && externalInviteMode === "password" && !externalInvitePassword) {
    return fail("External invitation password is required.", { externalInvitePassword: "Password is required." });
  }
  if (externalInviteEnabled && externalInviteMode === "entry_code" && !externalInviteEntryCode) {
    return fail("External invitation entry code is required.", { externalInviteEntryCode: "Entry code is required." });
  }

  const selectedBatchIds = formData.getAll("batches").map(String).filter(Boolean);
  const selectedStudentIds = formData.getAll("students").map(String).filter(Boolean);
  const selectedCourseIds = formData.getAll("courses").map(String).filter(Boolean);
  const selectedLevels = formData.getAll("levels").map(String).filter(Boolean);
  const [activeStudents, inactiveStudents, coaches, batches, selectedStudents, selectedCourses] = await Promise.all([
    formData.get("allActiveStudents") === "yes" ? User.find({ role: "student", isActive: { $ne: false } }).lean() : [],
    formData.get("includeInactiveStudents") === "yes" ? User.find({ role: "student", isActive: false }).lean() : [],
    formData.get("includeCoaches") === "yes" ? User.find({ role: "instructor", isActive: { $ne: false } }).lean() : [],
    selectedBatchIds.length ? Batch.find({ _id: { $in: selectedBatchIds } }).lean() : [],
    selectedStudentIds.length ? User.find({ _id: { $in: selectedStudentIds }, role: "student" }).lean() : [],
    selectedCourseIds.length ? Course.find({ _id: { $in: selectedCourseIds } }).lean() : [],
  ]);
  if (
    formData.get("allActiveStudents") !== "yes" &&
    formData.get("includeInactiveStudents") !== "yes" &&
    formData.get("includeCoaches") !== "yes" &&
    !selectedBatchIds.length &&
    !selectedStudentIds.length &&
    !selectedCourseIds.length &&
    !selectedLevels.length &&
    !externalInviteEnabled
  ) {
    return fail("Select at least one access group or enable external invitation access.", { access: "Select at least one access group or enable external invitation access." });
  }
  const batchStudentIds = batches.flatMap((batch: any) => (batch.students || []).map((id: any) => id.toString()));
  const courseLevelTargets = selectedCourses
    .map((course: any) => String(course.level || ""))
    .filter((level) => level && level !== "mixed");
  const levelTargets = Array.from(new Set([...selectedLevels, ...courseLevelTargets]));
  const levelStudents = levelTargets.length ? await User.find({ role: "student", studentLevel: { $in: levelTargets }, isActive: { $ne: false } }).lean() : [];
  const accessUsers = Array.from(new Set(
    [...activeStudents, ...inactiveStudents, ...coaches, ...selectedStudents, ...levelStudents]
      .map((user: any) => user._id.toString())
      .concat(batchStudentIds)
  ));
  const baseStart = combineDateTime(startDate, startTime);
  if (Number.isNaN(baseStart.getTime())) return fail("The tournament start date or time is invalid.", { startDate: "Start date or time is invalid." });
  const repeatEnabled = formData.get("repeatEnabled") === "yes";
  const repeatCount = repeatEnabled ? Math.max(1, Number(formData.get("repeatCount") || 1)) : 1;
  const repeatDaily = formData.get("repeatDaily") === "yes";
  const repeatUntil = formData.get("repeatUntilDate") ? new Date(String(formData.get("repeatUntilDate"))) : null;
  const repeatDays = String(formData.get("repeatDays") || "").split(",").map((day) => Number(day.trim())).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  const starts: Date[] = [];
  for (let offset = 0; starts.length < repeatCount && offset < 370; offset += 1) {
    const date = new Date(baseStart);
    date.setDate(baseStart.getDate() + offset);
    if (repeatUntil && date > repeatUntil) break;
    if (!repeatEnabled && offset > 0) break;
    if (offset === 0 || repeatDaily || repeatDays.includes(date.getDay())) starts.push(date);
  }
  if (!starts.length) {
    return fail("No valid tournament dates could be generated from the repeat settings.", { repeatCount: "Repeat settings produced no valid dates." });
  }

  let firstId = "";
  try {
    for (const startAt of starts) {
      const doc = await Tournament.create({
        name: repeatEnabled ? datedName(name, startAt) : name,
        description: String(formData.get("description") || "").trim(),
        type,
        status: initialStatus,
        arenaDurationMinutes: type === "arena" ? arenaDurationMinutes : 0,
        rounds: type === "swiss" ? rounds : 0,
        rulesVersion: CURRENT_RULES_VERSION,
        initialClockSeconds: resolvedClockSeconds,
        timeControlMinutes,
        incrementSeconds,
        breakBetweenRoundsMinutes: type === "swiss" ? breakBetweenRoundsMinutes : 0,
        rated,
        allowBerserk: type === "arena" ? allowBerserk : false,
        arenaStreaks: type === "arena" ? arenaStreaks : false,
        chatEnabled,
        lateJoiningAllowed,
        entryRestrictions,
        startAt,
        repeat: {
          enabled: repeatEnabled,
          untilDate: repeatUntil,
          selectedDays: repeatDays,
          repeatCount,
          daily: repeatDaily,
        },
        startingPosition: {
          type: startingPositionType,
          fen: startingPositionType === "custom" ? customFen : "",
        },
        access: {
          allActiveStudents: formData.get("allActiveStudents") === "yes",
          includeCoaches: formData.get("includeCoaches") === "yes",
          includeInactiveStudents: formData.get("includeInactiveStudents") === "yes",
          batches: selectedBatchIds,
          courses: selectedCourseIds,
          levels: levelTargets,
          users: accessUsers,
        },
        externalInvite: {
          enabled: externalInviteEnabled,
          token: externalInviteEnabled ? randomBytes(24).toString("hex") : "",
          password: externalInviteEnabled && externalInviteMode === "password" ? externalInvitePassword : "",
          entryCode: externalInviteEnabled && externalInviteMode === "entry_code" ? externalInviteEntryCode : "",
          accessMode: externalInviteEnabled ? externalInviteMode : "private",
          createdAt: externalInviteEnabled ? new Date() : undefined,
          expiresAt: externalInviteEnabled && externalInviteExpiresAt ? new Date(externalInviteExpiresAt) : undefined,
        },
        createdBy: (session!.user as any).id,
      });
      if (!firstId) firstId = doc._id.toString();
    }
  } catch (error) {
    console.error("Tournament creation failed", error);
    return fail("The tournament could not be created. Please check the setup and try again.");
  }
  if (!firstId) return fail("The tournament could not be created because no valid session was generated.");
  redirect(`/tournaments/${firstId}`);
}

export default async function NewTournamentPage({ searchParams }: { searchParams?: { error?: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  let batches: any[] = [];
  let students: any[] = [];
  let courses: any[] = [];
  let loadError = "";
  try {
    await dbConnect();
    [batches, students, courses] = await Promise.all([
      Batch.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean(),
      User.find({ role: "student" }).sort({ name: 1 }).select("name email studentLevel isActive").lean(),
      Course.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean(),
    ]);
  } catch (error) {
    console.error("Tournament page load failed", error);
    loadError = "The tournament setup page could not load academy data right now.";
  }
  const errorMessage = String(searchParams?.error || loadError || "").trim();
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Create Tournament</h1>
        <p className="mt-1 text-sm text-slate-500">Create Swiss or Arena tournaments and define student access.</p>
      </div>
      <TournamentCreateForm
        error={errorMessage}
        action={createTournament}
        batches={batches.map((batch: any) => ({ id: batch._id.toString(), name: batch.name }))}
        students={students.map((student: any) => ({
          id: student._id.toString(),
          name: student.name,
          email: student.email,
          level: student.studentLevel || "not_set",
          active: student.isActive !== false,
        }))}
        courses={courses.map((course: any) => ({
          id: course._id.toString(),
          name: course.name,
          level: course.level || "mixed",
          levels: (course.levels || []).map((level: any) => ({ id: String(level._id), name: level.name })),
        }))}
      />
    </div>
  );
}
