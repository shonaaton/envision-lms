import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import {
  autoAdvanceSwissTournament,
  enforceTournamentGameTimeouts,
  finalizeTournamentIfComplete,
  recalculateTournamentStandings,
  startTournament,
  syncArenaPairings,
} from "@/lib/tournamentEngine";
import { notifyExternalTournamentParticipants, notifyTournamentUsers } from "@/lib/tournamentNotifications";

export const dynamic = "force-dynamic";

function participantCount(tournament: any) {
  return Number((tournament?.participants || []).length) + Number((tournament?.externalParticipants || []).length);
}

async function isAllowed(req: Request) {
  const secret = process.env.TOURNAMENT_CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  const session = await auth();
  return (session?.user as any)?.role === "admin";
}

async function tick(_: Request) {
  if (!(await isAllowed(_))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournaments: any[] = await Tournament.find({
    status: { $in: ["created", "registration_open", "starting_soon", "upcoming", "live", "playing"] },
  });
  const counts = { checked: tournaments.length, startingSoon: 0, started: 0, advanced: 0, paired: 0, finalized: 0 };
  const now = Date.now();

  for (const tournament of tournaments) {
    const beforeRound = Number(tournament.currentRound || 0);
    const beforeStatus = String(tournament.status || "");
    const startsIn = new Date(tournament.startAt || 0).getTime() - now;
    if (["created", "registration_open", "upcoming"].includes(beforeStatus) && startsIn > 0 && startsIn <= 15 * 60 * 1000) {
      tournament.status = "starting_soon";
      const alreadyNotified = (tournament.adminActions || []).some((action: any) => action.action === "notification.starting_soon");
      if (!alreadyNotified) {
        await notifyTournamentUsers(tournament, {
          type: "tournament.starting_soon",
          title: "Tournament starting soon",
          message: `${tournament.name} starts in less than 15 minutes.`,
          href: `/tournaments/${tournament._id}`,
        });
        await notifyExternalTournamentParticipants(tournament, {
          subject: `Starting soon: ${tournament.name}`,
          message: (participant) => `Hello ${participant.displayName || participant.username},\n\n${tournament.name} starts in less than 15 minutes. Open your tournament link to enter the lobby.`,
        });
        tournament.adminActions = [...(tournament.adminActions || []), {
          action: "notification.starting_soon",
          note: "Starting-soon notification sent by server tick.",
          createdAt: new Date(),
        }];
      }
      counts.startingSoon += 1;
    }

    const dueToStart =
      ["created", "registration_open", "starting_soon", "upcoming"].includes(String(tournament.status || "")) &&
      new Date(tournament.startAt || 0).getTime() <= Date.now() &&
      participantCount(tournament) >= 2;
    if (dueToStart) {
      await startTournament(tournament);
      counts.started += 1;
    }

    await enforceTournamentGameTimeouts(tournament);
    if (["live", "playing"].includes(String(tournament.status || "")) && tournament.type === "arena") {
      await syncArenaPairings(tournament);
      counts.paired += 1;
    }
    if (["live", "playing"].includes(String(tournament.status || "")) && tournament.type === "swiss") {
      await autoAdvanceSwissTournament(tournament);
      if (Number(tournament.currentRound || 0) > beforeRound) counts.advanced += 1;
    }
    await recalculateTournamentStandings(tournament);
    await finalizeTournamentIfComplete(tournament);
    if (["completed", "finished"].includes(String(tournament.status || "")) && !["completed", "finished"].includes(beforeStatus)) {
      counts.finalized += 1;
    }
    await tournament.save();
  }

  return NextResponse.json({ ok: true, counts });
}

export async function GET(req: Request) {
  return tick(req);
}

export async function POST(req: Request) {
  return tick(req);
}
