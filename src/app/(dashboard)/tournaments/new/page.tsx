import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { Tournament } from "@/models/Tournament";
import TournamentCreateForm from "@/components/tournaments/TournamentCreateForm";
import { redirect } from "next/navigation";

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
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();

  const selectedBatchIds = formData.getAll("batches").map(String).filter(Boolean);
  const [activeStudents, inactiveStudents, coaches, batches] = await Promise.all([
    formData.get("allActiveStudents") ? User.find({ role: "student", isActive: { $ne: false } }).lean() : [],
    formData.get("includeInactiveStudents") ? User.find({ role: "student", isActive: false }).lean() : [],
    formData.get("includeCoaches") ? User.find({ role: "instructor", isActive: { $ne: false } }).lean() : [],
    selectedBatchIds.length ? Batch.find({ _id: { $in: selectedBatchIds } }).lean() : [],
  ]);
  const batchStudentIds = batches.flatMap((batch: any) => (batch.students || []).map((id: any) => id.toString()));
  const accessUsers = Array.from(new Set([...activeStudents, ...inactiveStudents, ...coaches].map((user: any) => user._id.toString()).concat(batchStudentIds)));
  const baseStart = combineDateTime(String(formData.get("startDate")), String(formData.get("startTime")));
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

  let firstId = "";
  for (const startAt of starts) {
    const doc = await Tournament.create({
      name: repeatEnabled ? datedName(String(formData.get("name")), startAt) : formData.get("name"),
      description: formData.get("description"),
      type: formData.get("type"),
      status: "upcoming",
      arenaDurationMinutes: Number(formData.get("arenaDurationMinutes") || 0),
      rounds: Number(formData.get("rounds") || 0),
      timeControlMinutes: Number(formData.get("timeControlMinutes") || 10),
      incrementSeconds: Number(formData.get("incrementSeconds") || 0),
      breakBetweenRoundsMinutes: Number(formData.get("breakBetweenRoundsMinutes") || 0),
      startAt,
      repeat: {
        enabled: repeatEnabled,
        untilDate: repeatUntil,
        selectedDays: repeatDays,
        repeatCount,
        daily: repeatDaily,
      },
      startingPosition: {
        type: formData.get("startingPositionType"),
        fen: formData.get("customFen"),
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
  redirect(`/tournaments/${firstId}`);
}

export default async function NewTournamentPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const batches = await Batch.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Create Tournament</h1>
        <p className="mt-1 text-sm text-slate-500">Create Swiss or Arena tournaments and define student access.</p>
      </div>
      <TournamentCreateForm action={createTournament} batches={batches.map((batch: any) => ({ id: batch._id.toString(), name: batch.name }))} />
    </div>
  );
}
