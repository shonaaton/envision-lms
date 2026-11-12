"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { isTurnstileEnabled, verifyTurnstileToken } from "@/lib/humanVerification";
import { isFinishedStatus, isPlayingStatus, playerKeyForExternal } from "@/lib/tournamentEngine";
import { getTournamentGuestUsername, setTournamentGuestUsername } from "@/lib/tournamentGuests";
import { notifyAdmins, notifyExternalTournamentParticipant } from "@/lib/tournamentNotifications";
import { consumeTournamentRate } from "@/lib/tournamentRateLimit";

export async function joinExternalTournament(formData: FormData) {
  const token = String(formData.get("token") || "");
  const inviteHref = `/tournament-join/${encodeURIComponent(token)}`;
  const playHref = `${inviteHref}/play`;
  const reject = (reason: string): never => redirect(`${inviteHref}?error=${reason}`);
  const username = String(formData.get("username") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim().slice(0, 80) || username;
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const pin = String(formData.get("pin") || "").trim();
  const registrationKey = String(formData.get("registrationKey") || "");
  const captchaResponse = String(formData.get("cf-turnstile-response") || "").trim();
  if (username.length < 3 || username.length > 40) reject("username");
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) reject("email");
  if (!/^[0-9a-f-]{36}$/i.test(registrationKey)) reject("retry");

  const headerStore = await headers();
  const remoteIp = String(headerStore.get("x-forwarded-for") || "").split(",")[0]?.trim() || headerStore.get("x-real-ip");
  if (!consumeTournamentRate("guestJoin", remoteIp || "unknown").allowed) reject("rate_limit");

  await dbConnect();
  const cookieStore = await cookies();
  const signedUsername = getTournamentGuestUsername(cookieStore, token);
  const inviteFilter = { "externalInvite.enabled": true, "externalInvite.token": token };
  const playerKey = playerKeyForExternal(username);
  let humanVerified = false;
  let pinHash = "";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tournament: any = await Tournament.findOne(inviteFilter)
      .select("name status type lateJoiningAllowed startAt arenaEndsAt timeControlMinutes incrementSeconds externalInvite externalParticipants.username externalParticipants.email __v")
      .select("+externalParticipants.pinHash +externalParticipants.registrationKey")
      .lean();
    if (!tournament) return reject("invalid_invite");
    const players: any[] = tournament.externalParticipants || [];
    if (signedUsername && players.some((player) => playerKeyForExternal(player.username) === playerKeyForExternal(signedUsername))) {
      redirect(playHref);
    }
    const expiresAt = tournament.externalInvite?.expiresAt;
    const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
    const mode = String(tournament.externalInvite?.accessMode || "password");
    if (mode === "password" && tournament.externalInvite?.password !== password) reject("access");
    if (mode === "entry_code" && tournament.externalInvite?.entryCode !== password) reject("access");

    if (!humanVerified && isTurnstileEnabled()) {
      const verification = await verifyTurnstileToken(captchaResponse, remoteIp);
      if (!verification.ok) reject("human_verification");
      humanVerified = true;
    }

    const existing = players.find((player) => playerKeyForExternal(player.username) === playerKey);
    if (existing) {
      if (expired && !existing.pinHash) reject("expired");
      if (existing.pinHash && (!/^\d{6}$/.test(pin) || !(await bcrypt.compare(pin, existing.pinHash)))) reject("pin_mismatch");
      if (!setTournamentGuestUsername(cookieStore, token, existing.username)) reject("session");
      redirect(playHref);
    }

    if (expired) reject("expired");
    if (isFinishedStatus(tournament.status) || tournament.status === "cancelled" ||
        (tournament.type === "arena" && tournament.arenaEndsAt && new Date(tournament.arenaEndsAt).getTime() <= Date.now())) reject("closed");
    const playing = isPlayingStatus(tournament.status);
    if (playing && tournament.lateJoiningAllowed === false) reject("late_join");
    if (players.some((player) => player.registrationKey === registrationKey)) reject("already_registered");
    if (email && players.some((player) => String(player.email || "").trim().toLowerCase() === email)) reject("email_registered");
    if (!/^\d{6}$/.test(pin)) reject("pin_required");
    if (!pinHash) pinHash = await bcrypt.hash(pin, 10);

    const now = new Date();
    const queued = tournament.type === "arena" && playing;
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
          externalParticipants: { username, displayName, email, pinHash, registrationKey, joinedAt: now },
          participantStates: { playerKey, status: queued ? "queued" : "joined", joinedAt: now, queuedAt: queued ? now : undefined, lastSeenAt: now },
          standings: { playerKey, externalUsername: username, displayName },
          adminActions: { action: "external.registration", note: `${displayName} registered through ${mode} invitation.`, metadata: { username, mode }, createdAt: now },
        },
        $inc: { __v: 1 },
      }
    );
    if (!saved.modifiedCount) {
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 35));
      continue;
    }

    if (!setTournamentGuestUsername(cookieStore, token, username)) reject("session");
    void Promise.all([
      notifyAdmins({
        type: "tournament.external_registration",
        title: "External tournament registration",
        message: `${displayName} registered for ${tournament.name}.`,
        tournamentId: String(tournament._id),
        href: `/tournaments/${tournament._id}`,
      }),
      Promise.resolve().then(() => notifyExternalTournamentParticipant({
        email,
        name: displayName,
        tournamentName: tournament.name,
        subject: `Registration confirmed: ${tournament.name}`,
        message: `Hello ${displayName},\n\nYour registration for ${tournament.name} is confirmed.\n\nStart: ${formatAcademyDateTime(tournament.startAt)} IST\nTime control: ${tournament.timeControlMinutes}+${tournament.incrementSeconds}\nYour username: ${username}\n\nTo play on a different device, enter the same username and Player PIN on the invitation page.`,
        href: playHref,
        tournamentId: String(tournament._id),
      })),
    ]).catch((error) => console.error("Tournament registration notification failed", error));
    redirect(playHref);
  }
  reject("retry");
}
