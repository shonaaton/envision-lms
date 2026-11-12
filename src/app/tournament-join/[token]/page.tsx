import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { randomUUID } from "crypto";
import { notFound, redirect } from "next/navigation";
import Script from "next/script";
import { CalendarClock, Clock3, Swords, Trophy, Users } from "lucide-react";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { getTurnstileSiteKey } from "@/lib/humanVerification";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { isFinishedStatus, isPlayingStatus } from "@/lib/tournamentEngine";
import { tournamentRuleSections } from "@/lib/tournament/rules";
import { lateEntryOpen } from "@/lib/tournament/lichessRules";
import { formatTimeControl, resolveTimeControl } from "@/lib/tournament/timeControl";
import { GuestRegistrationForm } from "./GuestRegistrationForm";

export const dynamic = "force-dynamic";

/** Why a new guest cannot register right now, or "" when they can. */
function registrationClosedMessage(tournament: any) {
  const expiresAt = tournament.externalInvite?.expiresAt;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "Registration has closed.";
  if (isFinishedStatus(tournament.status) || tournament.status === "cancelled") return "This tournament is over.";
  if (tournament.type === "arena" && tournament.arenaEndsAt && new Date(tournament.arenaEndsAt).getTime() <= Date.now()) return "This tournament is over.";
  if (isPlayingStatus(tournament.status) && !lateEntryOpen(tournament)) return "The tournament has started and late entry is closed.";
  return "";
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
        <span className="text-slate-400" aria-hidden>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export default async function ExternalTournamentJoinPage({ params }: { params: { token: string } }) {
  await dbConnect();
  const tournament: any = await Tournament.findOne({ "externalInvite.enabled": true, "externalInvite.token": params.token })
    .select("-adminActions -chatMessages -roundsData -standings -finalSnapshot")
    .lean();
  if (!tournament) notFound();

  const cookieStore = await cookies();
  const joinedGuest = getTournamentGuestUsername(cookieStore, params.token);
  if (
    joinedGuest &&
    (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === joinedGuest.toLowerCase())
  ) {
    redirect(`/tournament-join/${params.token}/play`);
  }

  const turnstileSiteKey = getTurnstileSiteKey();
  const playerCount = (tournament.participants?.length || 0) + (tournament.externalParticipants?.length || 0);
  const closed = registrationClosedMessage(tournament);
  const live = isPlayingStatus(tournament.status);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:py-12">
      {turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" /> : null}
      <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-white p-5 text-slate-950 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
            <Trophy size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Envision Chess Academy</p>
            <h1 className="mt-0.5 break-words text-2xl font-semibold leading-tight">{tournament.name}</h1>
            {tournament.description ? <p className="mt-1 text-sm text-slate-600">{tournament.description}</p> : null}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2">
          <Fact icon={<CalendarClock size={13} />} label={live ? "Started" : "Starts"} value={`${formatAcademyDateTime(tournament.startAt)} IST`} />
          <Fact
            icon={<Swords size={13} />}
            label="Format"
            value={tournament.type === "arena" ? `Arena, ${tournament.arenaDurationMinutes} min` : `Swiss, ${tournament.rounds} rounds`}
          />
          <Fact icon={<Clock3 size={13} />} label="Time control" value={formatTimeControl(resolveTimeControl(tournament))} />
          <Fact icon={<Users size={13} />} label="Players registered" value={String(playerCount)} />
        </div>

        {live && !closed ? (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            The tournament is live. You can still join{tournament.type === "arena" ? " and start playing straight away." : " from the next round."}
          </p>
        ) : null}

        <GuestRegistrationForm
          token={params.token}
          accessMode={String(tournament.externalInvite?.accessMode || "private")}
          registrationKey={randomUUID()}
          turnstileSiteKey={turnstileSiteKey}
          rules={tournamentRuleSections(tournament)}
          registrationClosedMessage={closed}
        />
      </div>
    </div>
  );
}
