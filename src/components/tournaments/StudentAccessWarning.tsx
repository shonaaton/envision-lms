import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { studentRoleTournamentAccess } from "@/lib/tournament/studentAccess";

/**
 * For organisers: says so, loudly, when students cannot open Tournaments.
 * Students are then bounced off every tournament page, so an event full of
 * students plays out as forfeits (14 Nov 2026). Renders nothing when all is well.
 */
export async function StudentAccessWarning({ className = "" }: { className?: string }) {
  const access = await studentRoleTournamentAccess();
  if (access.ok) return null;
  return (
    <div className={className}>
      <div role="alert" className="card border-rose-300 bg-rose-50">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-800">
          <AlertTriangle size={15} aria-hidden /> Students cannot play in tournaments
        </h2>
        <p className="mt-1 text-sm text-rose-800">
          {access.problem} Students are sent back to the dashboard from every tournament page, so they cannot register, join or
          make a move. Guests are not affected.
        </p>
        <Link href="/admin/feature-access" className="mt-2 inline-block text-sm font-semibold text-rose-800 underline">
          Open Feature Access
        </Link>
      </div>
    </div>
  );
}
