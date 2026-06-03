import { dbConnect } from "@/lib/db";
import { Submission } from "@/models/Homework";

export default async function LeaderboardPage() {
  await dbConnect();
  const top = await Submission.aggregate([
    { $group: { _id: "$student", points: { $sum: "$totalScore" }, solved: { $sum: 1 } } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $sort: { points: -1 } },
    { $limit: 50 },
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-accent">Leaderboard</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400"><tr><th className="py-2 text-left">#</th><th className="text-left">Student</th><th className="text-left">Points</th><th className="text-left">Solved</th></tr></thead>
          <tbody>
            {top.map((r: any, i: number) => (
              <tr key={r._id} className="border-t border-ink-700">
                <td className="py-2 text-accent font-semibold">{i + 1}</td>
                <td className="text-white">{r.user?.name}</td>
                <td>{r.points}</td>
                <td>{r.solved}</td>
              </tr>
            ))}
            {top.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">No submissions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
