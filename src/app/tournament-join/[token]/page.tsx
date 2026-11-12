import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { randomUUID } from "crypto";
import { notFound, redirect } from "next/navigation";
import Script from "next/script";
import { Trophy } from "lucide-react";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { getTurnstileSiteKey } from "@/lib/humanVerification";
import { joinExternalTournament } from "./actions";
import { formatAcademyDateTime } from "@/lib/academyTime";

export const dynamic = "force-dynamic";

function guestJoinErrorMessage(code: string) {
  if (code === "human_verification") return "Please complete the human verification check and try again.";
  if (code === "access") return "The invitation password or entry code is not correct.";
  if (code === "username") return "Please choose a username between 3 and 40 characters.";
  if (code === "expired") return "This invitation has expired. Please ask the organizer for a fresh link.";
  if (code === "invalid_invite") return "This invitation link is no longer valid.";
  if (code === "closed") return "This tournament has ended. New registrations are closed.";
  if (code === "late_join") return "This tournament has started and late joining is closed. If you already registered, use your original username.";
  if (code === "pin_required") return "Choose a six-digit Player PIN so you can return to this profile.";
  if (code === "pin_mismatch") return "This username is already registered. Enter its Player PIN or choose a different username.";
  if (code === "email") return "Enter a valid contact email or leave the email field blank.";
  if (code === "email_registered") return "This email is already linked to a player in this tournament. Rejoin with your original username and Player PIN.";
  if (code === "already_registered") return "This form already registered a player. Rejoin with the original username and Player PIN.";
  if (code === "rate_limit") return "Too many join attempts. Wait a moment and try again.";
  if (code === "session") return "The tournament room could not start your session. Please contact the organizer.";
  if (code === "retry") return "The tournament changed while you were joining. Please try again.";
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
  const cookieStore = await cookies();
  const mode = String(tournament.externalInvite?.accessMode || "private");
  const joinedGuest = getTournamentGuestUsername(cookieStore, params.token);
  if (
    joinedGuest &&
    (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === joinedGuest.toLowerCase())
  ) {
    redirect(`/tournament-join/${params.token}/play`);
  }
  const inviteExpired = Boolean(tournament.externalInvite?.expiresAt && new Date(tournament.externalInvite.expiresAt).getTime() <= Date.now());
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
          <div><div className="text-xs text-slate-500">Start</div><b>{`${formatAcademyDateTime(tournament.startAt)} IST`}</b></div>
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

        <p className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {inviteExpired
            ? "Registration has closed. If you already registered with a Player PIN, use it to return."
            : "No account needed. If you already registered, use the same username and Player PIN."}
        </p>

        <form action={joinExternalTournament} className="space-y-4">
          <input type="hidden" name="token" value={params.token} />
          <input type="hidden" name="registrationKey" value={randomUUID()} />
          <label className="block text-sm font-medium">
            Username
            <input name="username" required minLength={3} maxLength={40} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Enter your tournament name" />
          </label>
          <label className="block text-sm font-medium">
            Display Name
            <input name="displayName" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Name shown in standings" />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Optional contact email" />
          </label>
          <label className="block text-sm font-medium">
            Player PIN
            <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Choose or enter your six-digit PIN" />
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
