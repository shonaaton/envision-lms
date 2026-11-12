/**
 * The rules a player is shown before they register, written from the
 * tournament's own settings and from the constants the engine actually plays
 * by. One source for every surface (the guest invite page, the portal
 * registration dialog, the event page, the confirmation email), so what a
 * player is told can never drift from what the server does.
 *
 * Pure: no I/O, safe on the client and the server.
 */

import { FIRST_MOVE_GRACE_MS, FIRST_MOVE_MAX_WAIT_MS } from "@/lib/tournament/firstMove";
import { DEFAULT_BERSERK_MIN_PLIES, tieBreakFor } from "@/lib/tournament/scoring";
import { berserkClock, canBerserkTimeControl, formatTimeControl, resolveTimeControl } from "@/lib/tournament/timeControl";

export type RuleSection = { title: string; rules: string[] };

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function clockPhrase(seconds: number) {
  if (seconds > 0 && seconds % 60 === 0) return plural(seconds / 60, "minute");
  return plural(seconds, "second");
}

/** "5 moves" from a ply count, rounded up: 7 plies is "4 moves". */
function movesFromPlies(plies: number) {
  return Math.ceil(Math.max(0, plies) / 2);
}

export function tournamentRuleSections(tournament: any): RuleSection[] {
  const arena = tournament?.type === "arena";
  const control = resolveTimeControl(tournament || {});
  const label = formatTimeControl(control);
  const graceSeconds = Math.round(FIRST_MOVE_GRACE_MS / 1000);
  const maxWaitMinutes = Math.round(FIRST_MOVE_MAX_WAIT_MS / 60000);
  const lateJoin = tournament?.lateJoiningAllowed !== false;

  const format: string[] = arena
    ? [
        `Arena: the tournament runs for ${plural(Number(tournament?.arenaDurationMinutes || 0), "minute")}. Play as many games as you can in that time.`,
        "When your game ends you go straight back into the queue and are usually paired again within a few seconds. An instant rematch with the opponent you just played is avoided while someone else is free or about to be.",
        "Games still being played when the Arena ends can be finished, but they do not count towards the standings.",
      ]
    : [
        `Swiss: ${plural(Number(tournament?.rounds || 0), "round")}. Everyone plays one game per round, against a player on a similar score.`,
        `The next round starts when every board in the current round has finished${
          Number(tournament?.breakBetweenRoundsMinutes || 0) > 0
            ? `, after a ${Number(tournament.breakBetweenRoundsMinutes)}-minute break`
            : ""
        }.`,
        "You never play the same opponent twice. With an odd number of players, one player gets a bye (a free point) in a round, and nobody gets a second bye while others have not had one.",
      ];

  format.push(
    `Time control ${label}: each player has ${clockPhrase(control.initialSeconds)} for the whole game${
      control.incrementSeconds > 0 ? `, plus ${plural(control.incrementSeconds, "second")} added after every move` : ", with no time added per move"
    }. Your clock starts once both players have made their first move.`
  );

  const scoring: string[] = [];
  if (arena) {
    scoring.push("Win 2 points, draw 1 point, loss 0.");
    if (tournament?.arenaStreaks !== false) {
      scoring.push("Win two games in a row and you are on fire: every game after that scores double until you fail to win one.");
    }
    if (tournament?.allowBerserk && canBerserkTimeControl(control)) {
      const berserk = berserkClock(control);
      const minPlies = Number(tournament?.berserkMinPlies ?? DEFAULT_BERSERK_MIN_PLIES);
      scoring.push(
        `Berserk: before your first move you may press Berserk to cut your clock to ${clockPhrase(berserk.initialSeconds)}${
          control.incrementSeconds > 0 ? " with no increment" : ""
        }. Win that game and you earn 1 extra point, as long as the game lasted at least ${plural(movesFromPlies(minPlies), "move")}.`
      );
    }
    const earlyDraw = Number(tournament?.earlyDrawMoveLimit ?? 10);
    if (earlyDraw > 0) scoring.push(`A draw in fewer than ${plural(movesFromPlies(earlyDraw), "move")} scores nothing for either player.`);
    const drawStreak = Number(tournament?.drawStreakLimit ?? 2);
    if (drawStreak > 0) scoring.push(`After ${plural(drawStreak, "draw")} in a row, further draws score nothing until you win or lose a game.`);
    scoring.push("Ties are broken by the number of wins, then by who needed fewer games.");
  } else {
    scoring.push("Win 1 point, draw ½ point, loss 0. A bye is worth 1 point.");
    const tieBreak = tieBreakFor(tournament);
    scoring.push(
      tieBreak?.key === "sonnebornBerger"
        ? "Ties are broken on Sonneborn-Berger (the strength of the opponents you scored against), then Buchholz, then the number of wins."
        : "Ties are broken on Buchholz (the combined score of your opponents), then the number of wins."
    );
  }

  const attendance: string[] = [
    "Open the tournament room a few minutes before the start and keep it open. Your board appears automatically when you are paired.",
    `Make your first move within ${graceSeconds} seconds of your board appearing. While you are on the board the wait can stretch to ${plural(maxWaitMinutes, "minute")}, never longer.`,
    arena
      ? "If you do not start a game, it is cancelled with no score and you are paused, so you are not paired while away. Press Resume in the tournament room to play again."
      : "If you do not start a game while your opponent is there, you lose it by forfeit. If neither player starts, the game is cancelled with no score. Either way you sit out the next round until you return to the tournament room.",
    "If your internet drops, your clock keeps running. Reconnect quickly: running out of time loses the game.",
    lateJoin
      ? arena
        ? "Late entry is allowed: you can join at any time while the Arena is running."
        : "Late entry is allowed: a late player joins from the next round, starting on 0 points."
      : "Late entry is not allowed: you must be registered before the tournament starts.",
  ];
  if (arena) attendance.push("You can pause between games if you need a break. You are not paired while paused.");

  const fairPlay: string[] = [
    "Play on your own. No chess engines, apps, books or help from anyone else during a game.",
    "Do not open the same game in a second tab or on another device to analyse it.",
    "Games are reviewed for fair play. The arbiter can change a result or remove a player who breaks these rules, and the arbiter's decision is final.",
  ];
  if (tournament?.chatEnabled) fairPlay.push("Keep the tournament chat friendly. Messages that are rude or give advice on a live game are removed.");
  if (String(tournament?.entryRestrictions || "").trim()) fairPlay.push(String(tournament.entryRestrictions).trim());

  return [
    { title: "Format", rules: format },
    { title: "Scoring", rules: scoring },
    { title: "Joining and playing", rules: attendance },
    { title: "Fair play", rules: fairPlay },
  ];
}

/** The same rules as plain text, for an email body. */
export function tournamentRulesText(tournament: any) {
  return tournamentRuleSections(tournament)
    .map((section) => `${section.title}\n${section.rules.map((rule) => `- ${rule}`).join("\n")}`)
    .join("\n\n");
}
