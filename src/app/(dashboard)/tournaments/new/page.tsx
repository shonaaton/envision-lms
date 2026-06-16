import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { Tournament } from "@/models/Tournament";
import TournamentCreateForm from "@/components/tournaments/TournamentCreateForm";
import { redirect } from "next/navigation";
import { Chess } from "chess.js";

export const dynamic = "force-dynamic";

function combineDateTime(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}:00`);
}

function datedName(name: string, date: Date) {
  return `${name} - ${date.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })} - ${date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

async function createTournament(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") {
    redirect("/tournaments/new?error=Only administrators can create tournaments.");
  }
  await dbConnect();
  const redirectWithError = (message: string) => redirect(`/tournaments/new?error=${encodeURIComponent(message)}`);

  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").trim() as "swiss" | "arena";
  const startDate = String(formData.get("startDate") || "").trim();
  const startTime = String(formData.get("startTime") || "").trim();
  const timeControlMinutes = Math.max(0, Number(formData.get("timeControlMinutes") || 0));
  const incrementSeconds = Math.max(0, Number(formData.get("incrementSeconds") || 0));
  const arenaDurationMinutes = Math.max(0, Number(formData.get("arenaDurationMinutes") || 0));
  const rounds = Math.max(0, Number(formData.get("rounds") || 0));
  const breakBetweenRoundsMinutes = Math.max(0, Number(formData.get("breakBetweenRoundsMinutes") || 0));
  const startingPositionType = String(formData.get("startingPositionType") || "normal");
  const customFen = String(formData.get("customFen") || "").trim();

  if (!name) redirectWithError("Tournament name is required.");
  if (type !== "swiss" && type !== "arena") redirectWithError("Please choose either Swiss or Arena format.");
  if (!startDate || !startTime) redirectWithError("Start date and start time are required.");
  if (timeControlMinutes < 1) redirectWithError("Time control must be at least 1 minute.");
  if (type === "arena" && arenaDurationMinutes < 1) redirectWithError("Arena tournaments need a total duration in minutes.");
  if (type === "swiss" && rounds < 1) redirectWithError("Swiss tournaments need at least 1 round.");
  if (startingPositionType === "custom") {
    if (!customFen) redirectWithError("Please provide a custom FEN for the starting position.");
    try {
      new Chess(customFen);
    } catch {
      redirectWithError("The custom FEN is not valid.");
    }
  }

  const selectedBatchIds = formData.getAll("batches").map(String).filter(Boolean);
  const [activeStudents, inactiveStudents, coaches, batches] = await Promise.all([
    formData.get("allActiveStudents") ? User.find({ role: "student", isActive: { $ne: false } }).lean() : [],
    formData.get("includeInactiveStudents") ? User.find({ role: "student", isActive: false }).lean() : [],
    formData.get("includeCoaches") ? User.find({ role: "instructor", isActive: { $ne: false } }).lean() : [],
    selectedBatchIds.length ? Batch.find({ _id: { $in: selectedBatchIds } }).lean() : [],
  ]);
  if (!formData.get("allActiveStudents") && !formData.get("includeInactiveStudents") && !formData.get("includeCoaches") && !selectedBatchIds.length) {
    redirectWithError("Select at least one access group before creating the tournament.");
  }
  const batchStudentIds = batches.flatMap((batch: any) => (batch.students || []).map((id: any) => id.toString()));
  const accessUsers = Array.from(new Set([...activeStudents, ...inactiveStudents, ...coaches].map((user: any) => user._id.toString()).concat(batchStudentIds)));
  const baseStart = combineDateTime(startDate, startTime);
  if (Number.isNaN(baseStart.getTime())) redirectWithError("The tournament start date or time is invalid.");
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
    redirectWithError("No valid tournament dates could be generated from the repeat settings.");
  }

  let firstId = "";
  try {
    for (const startAt of starts) {
      const doc = await Tournament.create({
        name: repeatEnabled ? datedName(name, startAt) : name,
        description: String(formData.get("description") || "").trim(),
        type,
        status: "upcoming",
        arenaDurationMinutes: type === "arena" ? arenaDurationMinutes : 0,
        rounds: type === "swiss" ? rounds : 0,
        timeControlMinutes,
        incrementSeconds,
        breakBetweenRoundsMinutes: type === "swiss" ? breakBetweenRoundsMinutes : 0,
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
          allActiveStudents: Boolean(formData.get("allActiveStudents")),
          includeCoaches: Boolean(formData.get("includeCoaches")),
          includeInactiveStudents: Boolean(formData.get("includeInactiveStudents")),
          batches: selectedBatchIds,
          users: accessUsers,
        },
        createdBy: (session!.user as any).id,
      });
      if (!firstId) firstId = doc._id.toString();
    }
  } catch (error) {
    console.error("Tournament creation failed", error);
    redirectWithError("The tournament could not be created. Please check the setup and try again.");
  }
  if (!firstId) redirectWithError("The tournament could not be created because no valid session was generated.");
  redirect(`/tournaments/${firstId}`);
}

export default async function NewTournamentPage({ searchParams }: { searchParams?: { error?: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  let batches: any[] = [];
  let loadError = "";
  try {
    await dbConnect();
    batches = await Batch.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
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
      <TournamentCreateForm error={errorMessage} action={createTournament} batches={batches.map((batch: any) => ({ id: batch._id.toString(), name: batch.name }))} />
    </div>
  );
}
