import { formatTimeControl, resolveTimeControl } from "./timeControl";

/**
 * What a player should do next, decided in one place.
 *
 * The tournament centre's whole job is to answer "what do I do now?", and that
 * answer depends on the tournament's status, the format, whether the player has
 * joined, whether they have a board, and whether they have paused. Working that
 * out inline produced a page where several buttons could be relevant at once
 * and none was clearly the one to press.
 */

export type PlayerActionKind =
  | "join"
  | "registered"
  | "finding-opponent"
  | "play"
  | "rejoin"
  | "waiting-round"
  | "paused"
  | "final-standings"
  | "cancelled"
  | "not-eligible"
  | "watch";

export type PlayerAction = {
  kind: PlayerActionKind;
  /** The button's words. Says what happens, not where it goes. */
  label: string;
  /** One line under it, when the label alone leaves a question. */
  hint?: string;
  href?: string;
  /** Whether this is a call to action or a statement of fact. */
  emphasis: "primary" | "secondary" | "muted";
};

export type PlayerActionInput = {
  tournamentId: string;
  status: string;
  type: "arena" | "swiss";
  joined: boolean;
  canPlay: boolean;
  /** The player has a board in progress right now. */
  hasActiveGame: boolean;
  /** They are looking at the tournament page rather than the board. */
  participantStatus?: string;
  roundProgress?: { roundNumber: number; completed: number; total: number } | null;
  nextRoundAt?: number | null;
  lateJoiningAllowed?: boolean;
  now?: number;
};

const PLAYING = ["live", "playing"];
const FINISHED = ["completed", "finished"];

export function resolvePlayerAction(input: PlayerActionInput): PlayerAction {
  const { tournamentId, status, type, joined, canPlay, hasActiveGame, participantStatus } = input;
  const playHref = `/tournaments/${tournamentId}/play`;
  const isPlaying = PLAYING.includes(status);

  if (status === "cancelled") {
    return { kind: "cancelled", label: "Tournament cancelled", emphasis: "muted" };
  }

  if (FINISHED.includes(status)) {
    return {
      kind: "final-standings",
      label: "View final standings",
      hint: joined ? "Your placement and games are recorded below." : undefined,
      emphasis: "primary",
    };
  }

  // Someone who cannot play — a coach or an admin observing — is offered the
  // event, not a button that would do nothing for them.
  if (!canPlay) {
    return {
      kind: "watch",
      label: isPlaying ? "Watch live boards" : "View tournament",
      hint: "You are viewing this event rather than playing in it.",
      emphasis: "secondary",
    };
  }

  if (!joined) {
    if (isPlaying && input.lateJoiningAllowed === false) {
      return {
        kind: "not-eligible",
        label: "Registration closed",
        hint: "This tournament does not allow late entries.",
        emphasis: "muted",
      };
    }
    return {
      kind: "join",
      label: isPlaying ? "Join now" : "Join tournament",
      hint: isPlaying ? "The event is already running - you will be paired shortly after joining." : undefined,
      emphasis: "primary",
    };
  }

  // A board in progress outranks everything: it is the only thing with a clock.
  if (hasActiveGame) {
    return {
      kind: "rejoin",
      label: "Rejoin your game",
      hint: "Your game is still running and your clock is ticking.",
      href: playHref,
      emphasis: "primary",
    };
  }

  if (!isPlaying) {
    return {
      kind: "registered",
      label: "You are registered",
      hint: "Your board opens automatically when the tournament starts.",
      emphasis: "secondary",
    };
  }

  if (participantStatus === "paused") {
    return {
      kind: "paused",
      label: "Rejoin the queue",
      hint: "You are paused, so you will not be paired until you rejoin.",
      href: playHref,
      emphasis: "primary",
    };
  }

  if (type === "arena") {
    return {
      kind: "finding-opponent",
      label: "Finding your next opponent",
      hint: "Your board opens the moment someone is free.",
      href: playHref,
      emphasis: "secondary",
    };
  }

  const round = input.roundProgress;
  if (round && round.total > 0 && round.completed < round.total) {
    return {
      kind: "waiting-round",
      label: `Waiting for round ${round.roundNumber}`,
      hint: `${round.completed} of ${round.total} games complete.`,
      href: playHref,
      emphasis: "secondary",
    };
  }

  const nextRoundAt = Number(input.nextRoundAt || 0);
  const now = input.now ?? Date.now();
  if (nextRoundAt && nextRoundAt > now) {
    const seconds = Math.max(0, Math.ceil((nextRoundAt - now) / 1000));
    return {
      kind: "waiting-round",
      label: "Next round starting",
      hint: `Round begins in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.`,
      href: playHref,
      emphasis: "secondary",
    };
  }

  return {
    kind: "waiting-round",
    label: "Waiting for your pairing",
    hint: "Your next board appears automatically.",
    href: playHref,
    emphasis: "secondary",
  };
}

/* ------------------------------------------------------------------ */
/* Card summaries                                                      */
/* ------------------------------------------------------------------ */

export type TournamentSummary = {
  statusLabel: string;
  /** live / upcoming / finished / cancelled — drives the visual treatment. */
  tone: "live" | "soon" | "upcoming" | "finished" | "cancelled";
  timeControl: string;
  /** "60 min arena" or "5 rounds". */
  format: string;
  participants: number;
};

export function describeTournament(tournament: any): TournamentSummary {
  const status = String(tournament?.status || "");
  const type = tournament?.type === "arena" ? "arena" : "swiss";
  const control = resolveTimeControl(tournament || {});
  const participants =
    Number((tournament?.participants || []).length) + Number((tournament?.externalParticipants || []).length);

  const tone: TournamentSummary["tone"] =
    status === "cancelled"
      ? "cancelled"
      : FINISHED.includes(status)
        ? "finished"
        : PLAYING.includes(status)
          ? "live"
          : status === "starting_soon"
            ? "soon"
            : "upcoming";

  const statusLabel =
    tone === "live"
      ? "Live now"
      : tone === "soon"
        ? "Starting soon"
        : tone === "finished"
          ? "Finished"
          : tone === "cancelled"
            ? "Cancelled"
            : status === "registration_open"
              ? "Registration open"
              : "Scheduled";

  const format =
    type === "arena"
      ? `${Number(tournament?.arenaDurationMinutes || 0)} min arena`
      : `${Number(tournament?.rounds || 0)} round${Number(tournament?.rounds || 0) === 1 ? "" : "s"} Swiss`;

  return { statusLabel, tone, timeControl: formatTimeControl(control), format, participants };
}

/** "in 4m", "in 2h 15m", "3 days ago" — relative and short enough for a card. */
export function relativeTime(target: Date | string | number | null | undefined, now = Date.now()) {
  if (!target) return "";
  const time = new Date(target).getTime();
  if (!Number.isFinite(time)) return "";
  const diff = time - now;
  const ahead = diff >= 0;
  const seconds = Math.abs(Math.round(diff / 1000));

  const format = () => {
    if (seconds < 60) return "less than a minute";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  };

  return ahead ? `in ${format()}` : `${format()} ago`;
}
