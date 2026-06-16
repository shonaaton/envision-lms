import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TournamentPlayClient } from "@/components/tournaments/TournamentPlayClient";

export const dynamic = "force-dynamic";

export default async function TournamentPlayPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <TournamentPlayClient tournamentId={params.id} />;
}
