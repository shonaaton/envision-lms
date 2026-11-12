"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { isTurnstileEnabled, verifyTurnstileToken } from "@/lib/humanVerification";
import { isFinishedStatus, isPlayingStatus, playerKeyForExternal } from "@/lib/tournamentEngine";
import { getTournamentGuestUsername, setTournamentGuestUsername } from "@/lib/tournamentGuests";
import { notifyAdmins } from "@/lib/tournamentNotifications";
import { sendTournamentRegistrationConfirmation } from "@/lib/tournamentReminders";
import { consumeTournamentRate } from "@/lib/tournamentRateLimit";
import { lateEntryOpen } from "@/lib/tournament/lichessRules";
import { findReturningGuest, registrationClash, validateGuestRegistration, type GuestFormState } from "@/lib/tournament/externalRegistration";

/**
 * Guest registration for a tournament invite link, in two forms:
 *
 *   register     name, username, email, optional WhatsApp, rules accepted
 *   returning    email or WhatsApp number + username, nothing else
 *
 * Both answer with a message for the form, or redirect into the play room.
 */

const MESSAGES: Record<string, string> = {
  access: "The invitation password or entry code is not correct.",
  invalid_invite: "This invitation link is no longer valid.",
  expired: "Registration for this tournament has closed. If you already registered, choose “I have already registered”.",
  closed: "This tournament has ended. New registrations are closed.",
  late_join: "This tournament has started and late entry is closed. If you already registered, choose “I have already registered”.",
  username_taken: "That username is already taken in this tournament. If it is yours, choose “I have already registered”; otherwise pick another.",
  email_registered: "This email is already registered for this tournament. Choose “I have already registered” and sign in with it and your username.",
  phone_registered: "This WhatsApp number is already registered for this tournament. Choose “I have already registered” and sign in with it and your username.",
  already_registered: "This form was already used to register. Choose “I have already registered” to enter the room.",
  human_verification: "Please complete the human verification check and try again.",
  rate_limit: "Too many attempts. Please wait a minute and try again.",
  session: "The tournament room could not start your session. Please contact the organiser.",
  retry: "The tournament changed while you were registering. Please try again.",
  not_found: "We could not find a registration with that username and email or WhatsApp number. Check both and try again, or register if you have not yet.",
  contact: "Enter the email address or WhatsApp number you registered with.",
  username: "Enter the username you registered with.",
};

function fail(code: string, field?: string): GuestFormState {
  return { error: MESSAGES[code] || code, field };
}

async function requestIp() {
  const headerStore = await headers();
  return String(headerStore.get("x-forwarded-for") || "").split(",")[0]?.trim() || headerStore.get("x-real-ip") || "unknown";
}

const GUEST_FIELDS =
  "name status type lateJoiningAllowed currentRound startAt arenaEndsAt arenaDurationMinutes rounds initialClockSeconds timeControlMinutes incrementSeconds allowBerserk arenaStreaks berserkMinPlies earlyDrawMoveLimit drawStreakLimit breakBetweenRoundsMinutes chatEnabled entryRestrictions rulesVersion externalInvite externalParticipants.username externalParticipants.displayName externalParticipants.email externalParticipants.phone externalParticipants.countryCode __v";

function accessProblem(tournament: any, password: string) {
  const mode = String(tournament.externalInvite?.accessMode || "password");
  if (mode === "password" && tournament.externalInvite?.password !== password) return "access";
  if (mode === "entry_code" && tournament.externalInvite?.entryCode !== password) return "access";
  return "";
}

export async function registerGuestForTournament(_previous: GuestFormState, formData: FormData): Promise<GuestFormState> {
  const token = String(formData.get("token") || "");
  const playHref = `/tournament-join/${encodeURIComponent(token)}/play`;
  const registrationKey = String(formData.get("registrationKey") || "");
  const password = String(formData.get("password") || "").trim();
  const captchaResponse = String(formData.get("cf-turnstile-response") || "").trim();

  const check = validateGuestRegistration({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    countryCode: formData.get("countryCode"),
    acceptRules: formData.get("acceptRules"),
  });
  if (!check.ok) return { error: check.message, field: check.error };
  const guest = check.value;
  if (!/^[0-9a-f-]{36}$/i.test(registrationKey)) return fail("retry");

  const remoteIp = await requestIp();
  if (!consumeTournamentRate("guestJoin", remoteIp).allowed) return fail("rate_limit");

  await dbConnect();
  const cookieStore = await cookies();
  const signedUsername = getTournamentGuestUsername(cookieStore, token);
  const inviteFilter = { "externalInvite.enabled": true, "externalInvite.token": token };
  const playerKey = playerKeyForExternal(guest.username);
  let humanVerified = false;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tournament: any = await Tournament.findOne(inviteFilter)
      .select(GUEST_FIELDS)
      .select("+externalParticipants.registrationKey")
      .lean();
    if (!tournament) return fail("invalid_invite");
    const players: any[] = tournament.externalParticipants || [];
    // This browser already holds a seat: never make it a second profile.
    if (signedUsername && players.some((player) => playerKeyForExternal(player.username) === playerKeyForExternal(signedUsername))) {
      redirect(playHref);
    }

    const problem = accessProblem(tournament, password);
    if (problem) return fail(problem, "password");

    if (!humanVerified && isTurnstileEnabled()) {
      const verification = await verifyTurnstileToken(captchaResponse, remoteIp);
      if (!verification.ok) return fail("human_verification");
      humanVerified = true;
    }

    const expiresAt = tournament.externalInvite?.expiresAt;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return fail("expired");
    if (
      isFinishedStatus(tournament.status) ||
      tournament.status === "cancelled" ||
      (tournament.type === "arena" && tournament.arenaEndsAt && new Date(tournament.arenaEndsAt).getTime() <= Date.now())
    ) {
      return fail("closed");
    }
    const playing = isPlayingStatus(tournament.status);
    if (playing && !lateEntryOpen(tournament)) return fail("late_join");
    if (players.some((player) => player.registrationKey === registrationKey)) return fail("already_registered");
    const clash = registrationClash(players, guest);
    if (clash) return fail(clash, clash === "username_taken" ? "username" : clash === "email_registered" ? "email" : "phone");

    const now = new Date();
    const queued = tournament.type === "arena" && playing;
    const mode = String(tournament.externalInvite?.accessMode || "password");
    const saved = await Tournament.updateOne(
      {
        ...inviteFilter,
        _id: tournament._id,
        status: tournament.status,
        __v: tournament.__v ?? { $exists: false },
        ...(playing ? { lateJoiningAllowed: { $ne: false } } : {}),
      },
      {
        $push: {
          externalParticipants: {
            username: guest.username,
            displayName: guest.displayName,
            email: guest.email,
            phone: guest.phone || undefined,
            countryCode: guest.countryCode || undefined,
            rulesAcceptedAt: now,
            registrationKey,
            joinedAt: now,
          },
          participantStates: { playerKey, status: queued ? "queued" : "joined", joinedAt: now, queuedAt: queued ? now : undefined, lastSeenAt: now },
          standings: { playerKey, externalUsername: guest.username, displayName: guest.displayName },
          adminActions: {
            action: "external.registration",
            note: `${guest.displayName} (${guest.username}) registered through ${mode} invitation.`,
            metadata: { username: guest.username, mode, hasPhone: Boolean(guest.phone) },
            createdAt: now,
          },
        },
        $inc: { __v: 1 },
      }
    );
    if (!saved.modifiedCount) {
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 35));
      continue;
    }

    if (!setTournamentGuestUsername(cookieStore, token, guest.username)) return fail("session");
    void Promise.all([
      notifyAdmins({
        type: "tournament.external_registration",
        title: "External tournament registration",
        message: `${guest.displayName} (${guest.username}) registered for ${tournament.name}.`,
        tournamentId: String(tournament._id),
        href: `/tournaments/${tournament._id}`,
      }),
      sendTournamentRegistrationConfirmation(tournament, { guest }),
    ]).catch((error) => console.error("Tournament registration notification failed", error));
    redirect(`${playHref}?registered=1`);
  }
  return fail("retry");
}

export async function returnGuestToTournament(_previous: GuestFormState, formData: FormData): Promise<GuestFormState> {
  const token = String(formData.get("token") || "");
  const playHref = `/tournament-join/${encodeURIComponent(token)}/play`;
  const contact = String(formData.get("contact") || "").trim();
  const username = String(formData.get("username") || "").trim();
  if (!contact) return fail("contact", "contact");
  if (!username) return fail("username", "username");

  const remoteIp = await requestIp();
  if (!consumeTournamentRate("guestReturn", remoteIp).allowed) return fail("rate_limit");

  await dbConnect();
  const tournament: any = await Tournament.findOne({ "externalInvite.enabled": true, "externalInvite.token": token })
    .select("name externalInvite.enabled externalInvite.token externalParticipants.username externalParticipants.email externalParticipants.phone externalParticipants.countryCode")
    .lean();
  if (!tournament) return fail("invalid_invite");

  const guest = findReturningGuest(tournament.externalParticipants || [], { username, contact });
  if (!guest) return fail("not_found");

  const cookieStore = await cookies();
  if (!setTournamentGuestUsername(cookieStore, token, guest.username)) return fail("session");
  redirect(playHref);
}
