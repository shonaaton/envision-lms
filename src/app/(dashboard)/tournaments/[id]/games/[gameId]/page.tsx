import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { TournamentSpectatorBoard } from "@/components/tournaments/TournamentSpectatorBoard";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export default async function TournamentGameSpectatorPage({ params }: { params: { id: string; gameId: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = String((session?.user as any)?.id || "");
  await dbConnect();
  const [tournament, game]: any[] = await Promise.all([
    Tournament.findById(params.id).populate("participants", "name username rating").lean(),
    TournamentGame.findOne({ _id: params.gameId, tournament: params.id }).lean(),
  ]);
  if (!tournament || !game) redirect(`/tournaments/${params.id}`);
  const allowed =
    role === "admin" ||
    role === "instructor" ||
    tournament.access?.allActiveStudents ||
    (tournament.access?.users || []).map((id: any) => String(id)).includes(userId) ||
    (tournament.participants || []).some((player: any) => objectId(player) === userId);
  if (!allowed) return <div className="p-6">You do not have access to this game.</div>;
  return (
    <TournamentSpectatorBoard
      tournamentId={params.id}
      gameId={params.gameId}
      initialGame={toPlain(game)}
      initialTournament={toPlain(tournament)}
    />
  );
}
