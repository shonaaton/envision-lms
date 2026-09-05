import { StudentReward } from "@/models/ClassroomLive";
import { calculateTournamentGameReward } from "@/lib/rewards";

/**
 * Award XP and coins for a finished tournament game.
 *
 * Idempotent by construction: the upsert is keyed on the student and the game,
 * so a duplicate result submission, a retried move, a reconnect and the timeout
 * worker all converge on the same single reward row. This was previously
 * duplicated in the move and result routes; it lives in one place now.
 */
export async function awardTournamentGameRewards(game: any) {
  if (!game || game.status !== "completed" || !game.result || game.result === "*") return;
  // An aborted or abandoned board is not a played game and earns nothing.
  if (game.termination === "abandoned") return;

  const rewards = [
    game.whiteUser
      ? { student: game.whiteUser, color: "white" as const, opponent: game.blackName || "bye" }
      : null,
    game.blackUser ? { student: game.blackUser, color: "black" as const, opponent: game.whiteName } : null,
  ].filter(Boolean) as Array<{ student: any; color: "white" | "black"; opponent: string }>;

  await Promise.all(
    rewards.map((entry) => {
      const reward = calculateTournamentGameReward(game.result, entry.color);
      return StudentReward.findOneAndUpdate(
        { student: entry.student, sourceType: "tournament_game", sourceId: game._id },
        {
          student: entry.student,
          sourceType: "tournament_game",
          sourceId: game._id,
          xp: reward.xp,
          coins: reward.coins,
          badge: reward.badge || "",
          reason: `Tournament game vs ${entry.opponent}`,
        },
        { upsert: true, new: true }
      );
    })
  );
}
