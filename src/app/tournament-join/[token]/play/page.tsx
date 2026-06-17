import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TournamentPlayClient } from "@/components/tournaments/TournamentPlayClient";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

export const dynamic = "force-dynamic";

export default async function ExternalTournamentPlayPage({ params }: { params: { token: string } }) {
  await dbConnect();
  const tournament: any = await Tournament.findOne({ "externalInvite.enabled": true, "externalInvite.token": params.token }).lean();
  if (!tournament) notFound();

  const cookieStore = await cookies();
  const username = getTournamentGuestUsername(cookieStore, params.token);
  if (!username) redirect(`/tournament-join/${params.token}`);

  const joined = (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === username.toLowerCase());
  if (!joined) redirect(`/tournament-join/${params.token}`);

  return (
    <TournamentPlayClient
      tournamentId={String(tournament._id)}
      backHref={`/tournament-join/${params.token}`}
      backLabel="Back to invite"
      guestLabel={username}
      publicRoom
    />
  );
}
