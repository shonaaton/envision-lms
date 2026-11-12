import { TournamentGame } from "@/models/TournamentGame";
import { User } from "@/models/User";
import { GLICKO_DEFAULT, deviationAfterInactivity, rateGame, type Glicko } from "@/lib/tournament/glicko2";

/**
 * Rated tournaments. After a game in a tournament marked "Rated" finishes,
 * both players' Glicko-2 ratings move and the change is stored on the game
 * (+/- shown next to the result). Only games between two portal members are
 * rated: a guest has no lasting rating. Each game is claimed before it is
 * rated, so a second pass can never rate it twice.
 */

const DAY_MS = 86_400_000;

/** A member's current rating, with RD grown back for the days since their last rated game. */
export function currentGlicko(user: any, now = Date.now()): Glicko {
  const stored = user?.tournamentRating;
  if (!stored || !Number.isFinite(Number(stored.rating))) return { ...GLICKO_DEFAULT };
  const glicko: Glicko = {
    rating: Number(stored.rating),
    deviation: Number(stored.deviation || GLICKO_DEFAULT.deviation),
    volatility: Number(stored.volatility || GLICKO_DEFAULT.volatility),
  };
  const days = stored.updatedAt ? (now - new Date(stored.updatedAt).getTime()) / DAY_MS : 0;
  return { ...glicko, deviation: deviationAfterInactivity(glicko, days) };
}

export function displayRating(user: any) {
  return Math.round(currentGlicko(user).rating);
}

function whiteScore(result: string) {
  if (result === "1-0") return 1;
  if (result === "0-1") return 0;
  if (result === "1/2-1/2") return 0.5;
  return null;
}

/** Rate every finished, unrated game of a rated tournament. Returns how many were rated. */
export async function rateFinishedGames(tournament: any) {
  if (!tournament?.rated) return 0;
  const games: any[] = await TournamentGame.find(
    {
      tournament: tournament._id,
      status: "completed",
      ratedAt: { $exists: false },
      whiteUser: { $exists: true, $ne: null },
      blackUser: { $exists: true, $ne: null },
      termination: { $ne: "bye" },
    },
    "_id whiteUser blackUser result endedAt"
  )
    .sort({ endedAt: 1 })
    .lean();

  let rated = 0;
  for (const game of games) {
    const score = whiteScore(String(game.result || ""));
    if (score === null) continue;
    const claimed = await TournamentGame.updateOne({ _id: game._id, ratedAt: { $exists: false } }, { $set: { ratedAt: new Date() } });
    if (!claimed.modifiedCount) continue;

    const [white, black]: any[] = await Promise.all([
      User.findById(game.whiteUser).select("tournamentRating").lean(),
      User.findById(game.blackUser).select("tournamentRating").lean(),
    ]);
    if (!white || !black) continue;
    const now = new Date();
    const before = { white: currentGlicko(white, now.getTime()), black: currentGlicko(black, now.getTime()) };
    const after = rateGame(before.white, before.black, score);
    const save = (userId: any, previous: any, next: Glicko) =>
      User.updateOne(
        { _id: userId },
        {
          $set: {
            tournamentRating: {
              rating: next.rating,
              deviation: next.deviation,
              volatility: next.volatility,
              games: Number(previous?.tournamentRating?.games || 0) + 1,
              updatedAt: now,
            },
          },
        }
      );
    await Promise.all([
      save(game.whiteUser, white, after.white),
      save(game.blackUser, black, after.black),
      TournamentGame.updateOne(
        { _id: game._id },
        {
          $set: {
            whiteRatingDiff: Math.round(after.white.rating) - Math.round(before.white.rating),
            blackRatingDiff: Math.round(after.black.rating) - Math.round(before.black.rating),
          },
        }
      ),
    ]);
    rated += 1;
  }
  return rated;
}
