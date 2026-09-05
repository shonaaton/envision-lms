/**
 * What a player is allowed to read.
 *
 * Tournament endpoints used to hand back whole mongoose documents, which meant
 * the guest-invite password, the entry code and the arbiter's audit trail went
 * to anyone who could open the page. Redaction lives here, in one place, so a
 * new endpoint cannot quietly reintroduce the leak and so the rules can be
 * tested directly.
 */

/** Fields on a tournament that only an arbiter may see. */
export const ARBITER_ONLY_TOURNAMENT_FIELDS = ["adminActions", "pairingLock", "roundLock"] as const;

/** Fields on the invite that are secrets, not facts about the event. */
export const INVITE_SECRET_FIELDS = ["password", "entryCode", "token"] as const;

/** Fields on a game that identify a browser session rather than the chess. */
export const GAME_SESSION_FIELDS = ["whiteActiveTabId", "blackActiveTabId", "whiteActiveTabAt", "blackActiveTabAt"] as const;

export function redactTournamentForPlayer(tournament: any, canManage: boolean) {
  if (!tournament) return tournament;
  if (canManage) return tournament;

  const next: any = { ...tournament };
  for (const field of ARBITER_ONLY_TOURNAMENT_FIELDS) delete next[field];

  // Whether an external link exists is a fact about the event and fine to
  // know. The credentials that would let someone use it are not.
  if (next.externalInvite) {
    next.externalInvite = {
      enabled: Boolean(next.externalInvite.enabled),
      accessMode: next.externalInvite.accessMode || "private",
    };
  }

  // A message an arbiter hid should not come back down the wire.
  if (Array.isArray(next.chatMessages)) {
    next.chatMessages = next.chatMessages.filter((message: any) => !message?.hidden);
  }

  return next;
}

export function redactGameForViewer(game: any, canManage: boolean) {
  if (!game) return game;
  if (canManage) return game;
  const next: any = { ...game };
  for (const field of GAME_SESSION_FIELDS) delete next[field];
  return next;
}
