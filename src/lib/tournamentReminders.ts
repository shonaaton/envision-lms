import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { tournamentRulesText } from "@/lib/tournament/rules";
import { formatTimeControl, resolveTimeControl } from "@/lib/tournament/timeControl";
import { notifyExternalTournamentParticipant } from "@/lib/tournamentNotifications";

/**
 * Registration confirmations and the start reminders (30 and 10 minutes
 * before), for portal members and guests alike. Members hear in-app, by
 * WhatsApp and by email; guests by email and, when they gave a number, by
 * WhatsApp. Everything here is best effort: a failed message never undoes a
 * registration or holds up the lifecycle worker.
 */

import type { TournamentReminderMinutes } from "@/lib/tournament/reminderSchedule";

export { dueTournamentReminder } from "@/lib/tournament/reminderSchedule";

type Guest = { username: string; displayName?: string; email?: string; phone?: string; countryCode?: string };

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function appUrl() {
  return resolvePublicAppUrl(undefined, { allowRequestHeaders: false }) || "";
}

export function tournamentStartLabel(tournament: any) {
  return tournament?.startAt ? `${formatAcademyDateTime(tournament.startAt)} IST` : "the scheduled time";
}

export function tournamentFormatLabel(tournament: any) {
  const control = formatTimeControl(resolveTimeControl(tournament || {}));
  return tournament?.type === "arena"
    ? `Arena, ${Number(tournament.arenaDurationMinutes || 0)} minutes, ${control}`
    : `Swiss, ${Number(tournament?.rounds || 0)} rounds, ${control}`;
}

/** Where a member opens the event. */
export function memberTournamentLink(tournament: any) {
  return `${appUrl()}/tournaments/${objectId(tournament)}`;
}

/** Where a guest opens the event: the invite page, which lets them back in. */
export function guestTournamentLink(tournament: any) {
  return `${appUrl()}/tournament-join/${encodeURIComponent(String(tournament?.externalInvite?.token || ""))}`;
}

function withdrawnKeys(tournament: any) {
  return new Set<string>(
    (tournament?.participantStates || [])
      .filter((state: any) => state?.status === "withdrawn")
      .map((state: any) => String(state.playerKey))
  );
}

const GUEST_RETURN_HINT =
  "On another device, open the link, choose “I have already registered” and enter your email or WhatsApp number and your username.";
const FIRST_MOVE_HINT = "Make your first move within 60 seconds of your board appearing, or you lose that game.";

function guestDedupKey(tournamentId: string, kind: string, username: string) {
  return `tournament:${tournamentId}:${kind}:${String(username).trim().toLowerCase()}`;
}

export async function sendTournamentRegistrationConfirmation(tournament: any, player: { userId?: string; guest?: Guest }) {
  try {
    const start = tournamentStartLabel(tournament);
    const format = tournamentFormatLabel(tournament);
    const rules = tournamentRulesText(tournament);
    const tournamentId = objectId(tournament);
    const kind = "tournament_registered";

    if (player.userId) {
      const user: any = await User.findById(player.userId).select("_id name username email phone countryCode isActive").lean();
      if (!user || user.isActive === false) return;
      const name = user.name || user.username || "there";
      await Notification.create({
        user: user._id,
        type: "tournament.registration",
        title: "Tournament registration confirmed",
        message: `You are registered for ${tournament.name}, starting ${start}. We will remind you 30 and 10 minutes before the start.`,
        metadata: { tournament: tournamentId, href: `/tournaments/${tournamentId}` },
      }).catch(() => undefined);
      await Promise.all([
        sendWhatsAppAutomationTemplates([{
          user,
          templateName: "tournament_registered",
          bodyParameters: [name, tournament.name, start, format, memberTournamentLink(tournament)],
          metadata: { kind, tournamentId, userId: String(user._id) },
        }]),
        user.email
          ? sendAutomationEmail({
              to: user.email,
              subject: `You're registered: ${tournament.name}`,
              message: `Hello ${name},\n\nYou are registered for ${tournament.name}.\n\nStarts: ${start}\nFormat: ${format}\n\nWe will remind you 30 minutes and 10 minutes before the start. Open the tournament page a few minutes early and keep it open: your first game appears automatically.\n\nTournament rules\n\n${rules}`,
              metadata: { kind, tournamentId, userId: String(user._id), href: `/tournaments/${tournamentId}`, actionLabel: "Open the tournament" },
            })
          : Promise.resolve(null),
      ]);
      return;
    }

    const guest = player.guest;
    if (!guest?.username) return;
    const name = guest.displayName || guest.username;
    const link = guestTournamentLink(tournament);
    await Promise.all([
      guest.phone
        ? sendWhatsAppAutomationTemplates([{
            to: guest.phone,
            user: { name, countryCode: guest.countryCode, phone: guest.phone },
            templateName: "tournament_registered",
            bodyParameters: [name, tournament.name, start, format, link],
            metadata: { kind, tournamentId, notificationDedupKey: guestDedupKey(tournamentId, kind, guest.username) },
          }])
        : Promise.resolve(null),
      notifyExternalTournamentParticipant({
        email: guest.email,
        name,
        tournamentName: tournament.name,
        subject: `You're registered: ${tournament.name}`,
        message: `Hello ${name},\n\nYou are registered for ${tournament.name}.\n\nStarts: ${start}\nFormat: ${format}\nYour username: ${guest.username}\n\nWe will remind you 30 minutes and 10 minutes before the start. Open the tournament room a few minutes early and keep it open: your first game appears automatically.\n\n${GUEST_RETURN_HINT}\n\nTournament rules\n\n${rules}`,
        href: link,
        tournamentId,
      }),
    ]);
  } catch (error) {
    console.error("Tournament registration confirmation failed", error);
  }
}

/**
 * One start reminder to every registered player who has not withdrawn. The
 * caller (the lifecycle worker) claims each reminder before calling, so it is
 * sent once however many ticks run.
 */
export async function sendTournamentReminder(tournament: any, minutes: TournamentReminderMinutes) {
  const tournamentId = objectId(tournament);
  const start = tournamentStartLabel(tournament);
  const kind = `tournament_reminder_${minutes}`;
  const withdrawn = withdrawnKeys(tournament);
  let members = 0;
  let guestsReached = 0;

  const memberIds = (tournament.participants || [])
    .map((item: any) => objectId(item))
    .filter((id: string) => id && !withdrawn.has(`user:${id}`));
  if (memberIds.length) {
    const users: any[] = await User.find({ _id: { $in: memberIds }, isActive: { $ne: false } })
      .select("_id name username email phone countryCode")
      .lean();
    const link = memberTournamentLink(tournament);
    await Notification.insertMany(
      users.map((user) => ({
        user: user._id,
        type: "tournament.reminder",
        title: `${tournament.name} starts in ${minutes} minutes`,
        message: `Open the tournament page now and keep it open. Your first board appears automatically at ${start}.`,
        metadata: { tournament: tournamentId, href: `/tournaments/${tournamentId}` },
      })),
      { ordered: false }
    ).catch(() => undefined);
    await sendWhatsAppAutomationTemplates(users.map((user) => ({
      user,
      templateName: "tournament_reminder",
      bodyParameters: [user.name || user.username || "there", tournament.name, String(minutes), start, link],
      metadata: { kind, tournamentId, userId: String(user._id) },
    })));
    await Promise.all(users.filter((user) => user.email).map((user) => sendAutomationEmail({
      to: user.email,
      subject: `Starts in ${minutes} minutes: ${tournament.name}`,
      message: `Hello ${user.name || user.username || "there"},\n\n${tournament.name} starts in ${minutes} minutes, at ${start}.\n\nOpen the tournament page now and keep it open: your first game appears automatically when the tournament begins. ${FIRST_MOVE_HINT}`,
      metadata: { kind, tournamentId, userId: String(user._id), href: `/tournaments/${tournamentId}`, actionLabel: "Open the tournament" },
    }).catch(() => null)));
    members = users.length;
  }

  const guests: Guest[] = (tournament.externalParticipants || []).filter(
    (guest: any) => guest?.username && !withdrawn.has(`external:${String(guest.username).trim().toLowerCase()}`)
  );
  if (guests.length) {
    const link = guestTournamentLink(tournament);
    await sendWhatsAppAutomationTemplates(guests.filter((guest) => guest.phone).map((guest) => ({
      to: guest.phone,
      user: { name: guest.displayName || guest.username, countryCode: guest.countryCode, phone: guest.phone },
      templateName: "tournament_reminder",
      bodyParameters: [guest.displayName || guest.username, tournament.name, String(minutes), start, link],
      metadata: { kind, tournamentId, notificationDedupKey: guestDedupKey(tournamentId, kind, guest.username) },
    })));
    await Promise.all(guests.filter((guest) => guest.email).map((guest) => notifyExternalTournamentParticipant({
      email: guest.email,
      name: guest.displayName || guest.username,
      tournamentName: tournament.name,
      subject: `Starts in ${minutes} minutes: ${tournament.name}`,
      message: `Hello ${guest.displayName || guest.username},\n\n${tournament.name} starts in ${minutes} minutes, at ${start}.\n\nOpen the tournament room now and keep it open: your first game appears automatically when the tournament begins. ${FIRST_MOVE_HINT}\n\nYour username: ${guest.username}\n${GUEST_RETURN_HINT}`,
      href: link,
      tournamentId,
    }).catch(() => null)));
    guestsReached = guests.length;
  }
  return { members, guests: guestsReached };
}
