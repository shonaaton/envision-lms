import { dbConnect } from "@/lib/db";
import { Submission } from "@/models/Homework";
import { Attendance } from "@/models/Attendance";
import { LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { User } from "@/models/User";
import { Award, Coins, Trophy, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

function pct(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

export default async function LeaderboardPage({ searchParams }: { searchParams: { scope?: string; rankBy?: string } }) {
  await dbConnect();
  const [students, submissions, attendance, liveResponses, rewards] = await Promise.all([
    User.find({ role: "student", isActive: { $ne: false } }, { passwordHash: 0 }).lean(),
    Submission.find({}).lean(),
    Attendance.find({}).lean(),
    LiveQuestionResponse.find({}).lean(),
    StudentReward.find({}).lean(),
  ]);

  const rows = students.map((student: any) => {
    const id = student._id.toString();
    const hw = submissions.filter((submission: any) => submission.student.toString() === id);
    const live = liveResponses.filter((response: any) => response.student.toString() === id);
    const rewardRows = rewards.filter((reward: any) => reward.student.toString() === id);
    const attendanceRecords = attendance.flatMap((a: any) => a.records || []).filter((record: any) => record.student?.toString() === id);
    const present = attendanceRecords.filter((record: any) => record.status === "present" || record.status === "late");
    const homeworkPoints = hw.reduce((sum: number, item: any) => sum + (item.totalScore || 0), 0);
    const quizPoints = live.reduce((sum: number, item: any) => sum + (item.score || 0), 0);
    const xp = rewardRows.reduce((sum: number, item: any) => sum + (item.xp || 0), 0) + homeworkPoints + quizPoints;
    const coins = rewardRows.reduce((sum: number, item: any) => sum + (item.coins || 0), 0);
    const accuracyValues = [...hw.map((h: any) => h.accuracy || 0), ...live.map((r: any) => (r.correct ? 100 : 0))];
    const accuracy = accuracyValues.length ? Math.round(accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length) : 0;
    return {
      id,
      name: student.name,
      totalPoints: homeworkPoints + quizPoints + xp,
      homeworkCompleted: hw.length,
      quizScore: quizPoints,
      accuracy,
      attendance: pct(present.length, attendanceRecords.length),
      xp,
      coins,
      badges: rewardRows.filter((r: any) => r.badge).length,
    };
  });

  const rankBy = searchParams.rankBy || "totalPoints";
  rows.sort((a: any, b: any) => (b[rankBy as keyof typeof b] as number) - (a[rankBy as keyof typeof a] as number));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Trophy size={18} /></span>
          <div><h1 className="text-2xl font-semibold">Leaderboards & Rankings</h1><p className="text-sm text-slate-500">Quiz, homework, classroom, batch, and academy ranking foundation.</p></div>
        </div>
        <form className="flex gap-2 rounded-lg border bg-white p-2 shadow-sm">
          <select name="scope" defaultValue={searchParams.scope || "academy"} className="h-10 rounded-md border px-3 text-sm">
            <option value="academy">Academy Leaderboard</option>
            <option value="batch">Batch Leaderboard</option>
            <option value="classroom">Classroom Leaderboard</option>
            <option value="quiz">Quiz Leaderboard</option>
            <option value="homework">Homework Leaderboard</option>
          </select>
          <select name="rankBy" defaultValue={rankBy} className="h-10 rounded-md border px-3 text-sm">
            <option value="totalPoints">Total Points</option>
            <option value="accuracy">Highest Accuracy</option>
            <option value="homeworkCompleted">Most Homework Completed</option>
            <option value="attendance">Attendance Percentage</option>
            <option value="xp">XP</option>
            <option value="coins">Coins</option>
          </select>
          <button className="rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">Apply</button>
        </form>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm"><Zap className="text-purple-600" size={18} /><div className="mt-2 text-2xl font-semibold">{rows.reduce((s, r) => s + r.xp, 0)}</div><div className="text-xs text-slate-500">Total XP</div></div>
        <div className="rounded-lg border bg-white p-4 shadow-sm"><Coins className="text-amber-600" size={18} /><div className="mt-2 text-2xl font-semibold">{rows.reduce((s, r) => s + r.coins, 0)}</div><div className="text-xs text-slate-500">Coins Earned</div></div>
        <div className="rounded-lg border bg-white p-4 shadow-sm"><Award className="text-emerald-600" size={18} /><div className="mt-2 text-2xl font-semibold">{rows.reduce((s, r) => s + r.badges, 0)}</div><div className="text-xs text-slate-500">Badges Earned</div></div>
        <div className="rounded-lg border bg-white p-4 shadow-sm"><Trophy className="text-sky-600" size={18} /><div className="mt-2 text-2xl font-semibold">{rows.length}</div><div className="text-xs text-slate-500">Ranked Students</div></div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Rank</th><th>Student</th><th>Total Points</th><th>Quiz Score</th><th>Homework Completed</th><th>Accuracy</th><th>Attendance</th><th>XP</th><th>Coins</th><th>Badges</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-semibold text-purple-700">#{index + 1}</td>
                  <td className="font-medium">{row.name}</td>
                  <td>{row.totalPoints}</td>
                  <td>{row.quizScore}</td>
                  <td>{row.homeworkCompleted}</td>
                  <td>{row.accuracy}%</td>
                  <td>{row.attendance}%</td>
                  <td>{row.xp}</td>
                  <td>{row.coins}</td>
                  <td>{row.badges}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
