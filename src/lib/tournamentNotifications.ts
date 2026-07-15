import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { sendAutomationEmail } from "@/lib/emailAutomation";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export async function notifyTournamentUsers(tournament: any, input: {
  type: string;
  title: string;
  message: string;
  href?: string;
  users?: string[];
}) {
  try {
    const participantUsers = (tournament.participants || []).map((item: any) => objectId(item)).filter(Boolean);
    const users = Array.from(new Set((input.users ? input.users : participantUsers).filter(Boolean)));
    if (!users.length) return;
    await Notification.insertMany(
      users.map((user) => ({
        user,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: {
          tournament: objectId(tournament),
          href: input.href || `/tournaments/${objectId(tournament)}`,
        },
      })),
      { ordered: false }
    );
  } catch {
    // Notifications should never block tournament flow.
  }
}

export async function notifyTournamentBroadcast(tournament: any, input: {
  type: string;
  title: string;
  message: string;
  href?: string;
}) {
  return notifyTournamentUsers(tournament, input);
}

export async function notifyAdmins(input: {
  type: string;
  title: string;
  message: string;
  href?: string;
  tournamentId?: string;
}) {
  try {
    const admins = await User.find({ role: "admin", isActive: { $ne: false } }).select("_id").lean();
    if (!admins.length) return;
    await Notification.insertMany(
      admins.map((admin: any) => ({
        user: admin._id,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: {
          tournament: input.tournamentId,
          href: input.href || (input.tournamentId ? `/tournaments/${input.tournamentId}` : "/tournaments"),
        },
      })),
      { ordered: false }
    );
  } catch {
    // Admin notifications are best effort.
  }
}

export async function notifyExternalTournamentParticipant(input: {
  email?: string;
  name?: string;
  tournamentName: string;
  subject: string;
  message: string;
  href?: string;
  tournamentId?: string;
}) {
  if (!input.email) return { skipped: true };
  return sendAutomationEmail({
    to: input.email,
    subject: input.subject,
    message: input.message,
    metadata: {
      tournament: input.tournamentId,
      href: input.href,
      participantName: input.name,
      channel: "external_tournament",
    },
  });
}

export async function notifyExternalTournamentParticipants(tournament: any, input: {
  subject: string;
  message: (participant: any, index: number) => string;
  href?: string;
}) {
  const participants = tournament.externalParticipants || [];
  await Promise.all(participants.map((participant: any, index: number) =>
    notifyExternalTournamentParticipant({
      email: participant.email,
      name: participant.displayName || participant.username,
      tournamentName: tournament.name,
      subject: input.subject,
      message: input.message(participant, index),
      href: input.href || `/tournament-join/${tournament.externalInvite?.token || ""}/play`,
      tournamentId: objectId(tournament),
    })
  ));
}
