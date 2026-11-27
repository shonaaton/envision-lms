import { redirectToLogin } from "@/lib/redirectToLogin";
import { auth } from "@/lib/auth";
import { TournamentPlayClient } from "@/components/tournaments/TournamentPlayClient";

export const dynamic = "force-dynamic";

export default async function TournamentPlayPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirectToLogin();
  return <TournamentPlayClient tournamentId={params.id} />;
}
