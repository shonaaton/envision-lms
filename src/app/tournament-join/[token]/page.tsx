import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Script from "next/script";
import { Trophy, ArrowRight } from "lucide-react";
import { cookies, headers } from "next/headers";
import { getTournamentGuestUsername, setTournamentGuestUsername } from "@/lib/tournamentGuests";
import { playerKeyForExternal, recalculateTournamentStandings, setTournamentPlayerState, syncArenaPairings } from "@/lib/tournamentEngine";
import { notifyAdmins, notifyExternalTournamentParticipant } from "@/lib/tournamentNotifications";
import { getTurnstileSiteKey, isTurnstileEnabled, verifyTurnstileToken } from "@/lib/humanVerification";

export const dynamic = "force-dynamic";

async function joinExternalTournament(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  const username = String(formData.get("username") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const captchaResponse = String(formData.get("cf-turnstile-response") || "").trim();
  if (!token || !username) return;
  if (username.length < 3 || username.length > 40) redirect(`/tournament-join/${token}?error=username`);

  if (isTurnstileEnabled()) {
    const headerStore = await headers();
    const remoteIp = String(headerStore.get("x-forwarded-for") || "").split(",")[0]?.trim() || headerStore.get("x-real-ip");
    const verification = await verifyTurnstileToken(captchaResponse, remoteIp);
    if (!verification.ok) redirect(`/tournament-join/${token}?error=human_verification`);
  }

  await dbConnect();
  const tournament: any = await Tournament.findOne({ "externalInvite.enabled": true, "externalInvite.token": token });
  if (!tournament) redirect(`/tournament-join/${token}?error=invalid_invite`);
  if (tournament.externalInvite?.expiresAt && new Date(tournament.externalInvite.expiresAt).getTime() <= Date.now()) redirect(`/tournament-join/${token}?error=expired`);
  const mode = String(tournament.externalInvite?.accessMode || "password");
  if (mode === "password" && tournament.externalInvite?.password !== password) redirect(`/tournament-join/${token}?error=access`);
  if (mode === "entry_code" && tournament.externalInvite?.entryCode !== password) redirect(`/tournament-join/${token}?error=access`);

  const cookieStore = await cookies();
  const alreadyJoined = (tournament.externalParticipants || []).some((player: any) => player.username.toLowerCase() === username.toLowerCase());
  if (!alreadyJoined) {
    tournament.externalParticipants.push({ username, displayName: displayName || username, email, entryCode: mode === "entry_code" ? password : "", joinedAt: new Date() });
  }
  const isPlaying = ["live", "playing"].includes(String(tournament.status || ""));
  setTournamentPlayerState(tournament, playerKeyForExternal(username), tournament.type === "arena" && isPlaying ? "queued" : "joined");
  await recalculateTournamentStandings(tournament);
  tournament.adminActions = [...(tournament.adminActions || []), {
    action: "external.registration",
    note: `${displayName || username} registered through ${mode} invitation.`,
    metadata: { username, email, mode },
    createdAt: new Date(),
  }];
  await tournament.save();
  if (tournament.type === "arena" && isPlaying) await syncArenaPairings(String(tournament._id));
  await notifyAdmins({
    type: "tournament.external_registration",
    title: "External tournament registration",
    message: `${displayName || username} registered for ${tournament.name}.`,
    tournamentId: tournament._id.toString(),
    href: `/tournaments/${tournament._id}`,
  });
  await notifyExternalTournamentParticipant({
    email,
    name: displayName || username,
    tournamentName: tournament.name,
    subject: `Registration confirmed: ${tournament.name}`,
    message: `Hello ${displayName || username},\n\nYour registration for ${tournament.name} is confirmed.\n\nStart: ${new Date(tournament.startAt).toLocaleString("en-IN")}\nTime control: ${tournament.timeControlMinutes}+${tournament.incrementSeconds}\n\nUse your invitation link to enter the tournament lobby.`,
    href: `/tournament-join/${token}/play`,
    tournamentId: tournament._id.toString(),
  });
  setTournamentGuestUsername(cookieStore, token, username, { expiresAt: tournament.externalInvite?.expiresAt });
  revalidatePath(`/tournament-join/${token}`);
  redirect(`/tournament-join/${token}/play`);
}

function guestJoinErrorMessage(code: string) {
  if (code === "human_verification") return "Please complete the human verification check and try again.";
  if (code === "access") return "The invitation password or entry code is not correct.";
  if (code === "username") return "Please choose a username between 3 and 40 characters.";
  if (code === "expired") return "This invitation has expired. Please ask the organizer for a fresh link.";
  if (code === "invalid_invite") return "This invitation link is no longer valid.";
  return "";
}

export default async function ExternalTournamentJoinPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { error?: string };
}) {
  await dbConnect();
  const tournament: any = await Tournament.findOne({ "externalInvite.enabled": true, "externalInvite.token": params.token }).lean();
  if (!tournament) notFound();
  if (tournament.externalInvite?.expiresAt && new Date(tournament.externalInvite.expiresAt).getTime() <= Date.now()) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-xl rounded-lg border border-white/10 bg-white p-6 text-slate-950 shadow-2xl">
          <h1 className="text-2xl font-semibold">Invitation expired</h1>
          <p className="mt-2 text-sm text-slate-500">This tournament invitation is no longer valid. Please ask the organizer for a new link.</p>
        </div>
      </div>
    );
  }
  const cookieStore = await cookies();
  const mode = String(tournament.externalInvite?.accessMode || "private");
  const joinedGuest = getTournamentGuestUsername(cookieStore, params.token);
  if (
    joinedGuest &&
    (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === joinedGuest.toLowerCase())
  ) {
    redirect(`/tournament-join/${params.token}/play`);
  }
  const turnstileSiteKey = getTurnstileSiteKey();
  const errorMessage = guestJoinErrorMessage(String(searchParams?.error || ""));

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      {turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <div className="mx-auto max-w-xl rounded-lg border border-white/10 bg-white p-6 text-slate-950 shadow-2xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Trophy size={20} /></span>
          <div>
            <h1 className="text-2xl font-semibold">{tournament.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{tournament.description || "Join this tournament as a guest player."}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div><div className="text-xs text-slate-500">Type</div><b>{tournament.type === "arena" ? "Arena" : "Swiss"}</b></div>
          <div><div className="text-xs text-slate-500">Start</div><b>{new Date(tournament.startAt).toLocaleString("en-IN")}</b></div>
          <div><div className="text-xs text-slate-500">Time Control</div><b>{tournament.timeControlMinutes}+{tournament.incrementSeconds}</b></div>
          <div><div className="text-xs text-slate-500">Format</div><b>{tournament.type === "arena" ? `${tournament.arenaDurationMinutes} min Arena` : `${tournament.rounds} rounds`}</b></div>
          <div><div className="text-xs text-slate-500">Guests Joined</div><b>{tournament.externalParticipants?.length || 0}</b></div>
          <div><div className="text-xs text-slate-500">Access</div><b>{mode === "entry_code" ? "Entry Code" : mode === "password" ? "Password" : mode === "public" ? "Public Link" : "Private Link"}</b></div>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <form action={joinExternalTournament} className="space-y-4">
          <input type="hidden" name="token" value={params.token} />
          <label className="block text-sm font-medium">
            Username
            <input name="username" required defaultValue={joinedGuest} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Enter your tournament name" />
          </label>
          <label className="block text-sm font-medium">
            Display Name
            <input name="displayName" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Name shown in standings" />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Optional contact email" />
          </label>
          {["password", "entry_code"].includes(mode) ? (
            <label className="block text-sm font-medium">
              {mode === "entry_code" ? "Entry Code" : "Password"}
              <input name="password" required className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder={mode === "entry_code" ? "Enter entry code" : "Enter invite password"} />
            </label>
          ) : null}
          {turnstileSiteKey ? (
            <div className="space-y-2">
              <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="light" />
              <p className="text-xs text-slate-500">Human verification helps keep tournament rooms free from automated registrations and bot flooding.</p>
            </div>
          ) : null}
          <button className="h-10 w-full rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">Join Tournament</button>
        </form>

        {joinedGuest ? (
          <div className="mt-4 rounded-md border border-purple-200 bg-purple-50 p-4">
            <div className="text-sm font-semibold text-purple-900">Joined as {joinedGuest}</div>
            <p className="mt-1 text-sm text-purple-700">You are already registered on this device. Enter the tournament room to receive your board as soon as the event pairs you.</p>
            <a href={`/tournament-join/${params.token}/play`} className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">
              Enter Tournament Room <ArrowRight size={15} />
            </a>
          </div>
        ) : null}

        {(tournament.externalParticipants || []).length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Joined Guests</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(tournament.externalParticipants || []).map((player: any) => (
                <div key={player.username} className="rounded-md bg-purple-50 px-3 py-2 text-sm">{player.username}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
