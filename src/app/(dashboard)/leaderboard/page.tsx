import { dbConnect } from "@/lib/db";
import { Submission } from "@/models/Homework";
import { Attendance } from "@/models/Attendance";
import { LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Award, Coins, Trophy, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

function pct(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { scope?: string; rankBy?: string; batch?: string; course?: string; level?: string; classroom?: string };
}) {
  await dbConnect();
  const [students, submissions, attendance, liveResponses, rewards, batches, classrooms] = await Promise.all([
    User.find({ role: "student", isActive: { $ne: false } }, { passwordHash: 0 }).populate("batches", "name").lean(),
    Submission.find({}).lean(),
    Attendance.find({}).lean(),
    LiveQuestionResponse.find({}).lean(),
    StudentReward.find({}).lean(),
    Batch.find({ isActive: true }).sort({ name: 1 }).lean(),
    Classroom.find({ isActive: { $ne: false } }).populate("students", "_id").select("courseName level levelName students title").lean(),
  ]);

  const scope = searchParams.scope || "academy";
  const rankBy = searchParams.rankBy || "totalPoints";
  const selectedBatch = searchParams.batch || "";
  const selectedCourse = searchParams.course || "";
  const selectedLevel = searchParams.level || "";
  const selectedClassroom = searchParams.classroom || "";
  const availableCourses = Array.from(new Set(classrooms.map((item: any) => String(item.courseName || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const availableLevels = Array.from(new Set(classrooms.map((item: any) => String(item.levelName || item.level || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const courseStudentIds = new Set(
    selectedCourse
      ? classrooms
          .filter((item: any) => String(item.courseName || "") === selectedCourse)
          .flatMap((item: any) => (item.students || []).map((student: any) => objectId(student)))
      : []
  );
  const levelStudentIds = new Set(
    selectedLevel
      ? classrooms
          .filter((item: any) => String(item.levelName || item.level || "") === selectedLevel)
          .flatMap((item: any) => (item.students || []).map((student: any) => objectId(student)))
      : []
  );
  const classroomStudentIds = new Set(
    selectedClassroom
      ? classrooms
          .filter((item: any) => objectId(item._id) === selectedClassroom)
          .flatMap((item: any) => (item.students || []).map((student: any) => objectId(student)))
      : []
  );
  const scopedClassroomIds = new Set(
    classrooms
      .filter((item: any) => {
        if (scope === "class" && selectedClassroom) return objectId(item._id) === selectedClassroom;
        if (scope === "course" && selectedCourse) return String(item.courseName || "") === selectedCourse;
        if (scope === "level" && selectedLevel) return String(item.levelName || item.level || "") === selectedLevel;
        return true;
      })
      .map((item: any) => objectId(item._id))
  );

  const filteredStudents = students.filter((student: any) => {
    if (scope === "batch" && selectedBatch) {
      return (student.batches || []).some((batch: any) => objectId(batch) === selectedBatch);
    }
    if (scope === "course" && selectedCourse) {
      return courseStudentIds.has(objectId(student._id));
    }
    if (scope === "level" && selectedLevel) {
      return levelStudentIds.has(objectId(student._id));
    }
    if (scope === "class" && selectedClassroom) {
      return classroomStudentIds.has(objectId(student._id));
    }
    return true;
  });

  const rows = filteredStudents.map((student: any) => {
    const id = objectId(student._id);
    const hw = submissions.filter((submission: any) => objectId(submission.student) === id);
    const live = liveResponses.filter((response: any) => {
      if (objectId(response.student) !== id) return false;
      if (scope === "class" || scope === "course" || scope === "level") {
        return scopedClassroomIds.has(objectId(response.classroom));
      }
      return true;
    });
    const rewardRows = rewards.filter((reward: any) => objectId(reward.student) === id);
    const liveQuestionRewards = rewardRows.filter((reward: any) => reward.sourceType === "live_question");
    const tournamentRewards = rewardRows.filter((reward: any) => reward.sourceType === "tournament_game");
    const bonusRewards = rewardRows.filter((reward: any) => !["live_question", "tournament_game"].includes(String(reward.sourceType || "")));
    const attendanceRecords = attendance.flatMap((a: any) => a.records || []).filter((record: any) => objectId(record.student) === id);
    const present = attendanceRecords.filter((record: any) => record.status === "present" || record.status === "late");
    const homeworkPoints = hw.reduce((sum: number, item: any) => sum + (item.totalScore || 0), 0);
    const quizPoints = live.reduce((sum: number, item: any) => sum + (item.score || 0), 0);
    const tournamentPoints = tournamentRewards.reduce((sum: number, item: any) => sum + Number(item.xp || 0), 0);
    const bonusXp = bonusRewards.reduce((sum: number, item: any) => sum + Number(item.xp || 0), 0);
    const liveRewardXp = liveQuestionRewards.reduce((sum: number, item: any) => sum + Number(item.xp || 0), 0);
    const scopedTournamentPoints = scope === "course" || scope === "level" || scope === "class" ? 0 : tournamentPoints;
    const totalPoints = homeworkPoints + quizPoints + scopedTournamentPoints + bonusXp;
    const xp = totalPoints;
    const coins = rewardRows.reduce((sum: number, item: any) => sum + (item.coins || 0), 0);
    const accuracyValues = [...hw.map((h: any) => h.accuracy || 0), ...live.map((r: any) => (r.correct ? 100 : 0))];
    const accuracy = accuracyValues.length ? Math.round(accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length) : 0;
    return {
      id,
      name: student.name,
      batchNames: (student.batches || []).map((batch: any) => batch.name).join(", "),
      totalPoints,
      homeworkCompleted: hw.length,
      quizScore: quizPoints,
      tournamentPoints: scopedTournamentPoints,
      accuracy,
      attendance: pct(present.length, attendanceRecords.length),
      xp,
      coins,
      badges: rewardRows.filter((r: any) => r.badge).length,
      bonusXp,
      liveRewardXp,
    };
  });

  rows.sort((a: any, b: any) => (Number(b[rankBy as keyof typeof b] || 0) - Number(a[rankBy as keyof typeof a] || 0)));
  const title =
    scope === "batch"
      ? "Batch Leaderboard"
      : scope === "course"
        ? "Course Leaderboard"
        : scope === "level"
          ? "Level Leaderboard"
          : scope === "class"
            ? "Class Leaderboard"
            : "Academy Leaderboard";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Trophy size={18} /></span>
          <div><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm text-slate-500">Academy-wide, batch-wise, and course-specific student rankings.</p></div>
        </div>
        <form className="flex flex-wrap gap-2 rounded-lg border bg-white p-2 shadow-sm">
          <select name="scope" defaultValue={scope} className="h-10 rounded-md border px-3 text-sm">
            <option value="academy">Academy Leaderboard</option>
            <option value="batch">Batch Leaderboard</option>
            <option value="course">Course Leaderboard</option>
            <option value="level">Level Leaderboard</option>
            <option value="class">Class Leaderboard</option>
          </select>
          <select name="batch" defaultValue={selectedBatch} className="h-10 rounded-md border px-3 text-sm">
            <option value="">All batches</option>
            {batches.map((batch: any) => <option key={objectId(batch._id)} value={objectId(batch._id)}>{batch.name}</option>)}
          </select>
          <select name="course" defaultValue={selectedCourse} className="h-10 rounded-md border px-3 text-sm">
            <option value="">All courses</option>
            {availableCourses.map((course) => <option key={course} value={course}>{course}</option>)}
          </select>
          <select name="level" defaultValue={selectedLevel} className="h-10 rounded-md border px-3 text-sm">
            <option value="">All levels</option>
            {availableLevels.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <select name="classroom" defaultValue={selectedClassroom} className="h-10 rounded-md border px-3 text-sm">
            <option value="">All classes</option>
            {classrooms.map((classroom: any) => <option key={objectId(classroom._id)} value={objectId(classroom._id)}>{classroom.title}</option>)}
          </select>
          <select name="rankBy" defaultValue={rankBy} className="h-10 rounded-md border px-3 text-sm">
            <option value="totalPoints">Total Points</option>
            <option value="accuracy">Highest Accuracy</option>
            <option value="homeworkCompleted">Most Homework Completed</option>
            <option value="quizScore">Classroom Quiz Score</option>
            <option value="tournamentPoints">Tournament Points</option>
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
            <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Rank</th><th>Student</th><th>Batch</th><th>Total Points</th><th>Quiz Score</th><th>Tournament</th><th>Homework Completed</th><th>Accuracy</th><th>Attendance</th><th>XP</th><th>Coins</th><th>Badges</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-semibold text-purple-700">#{index + 1}</td>
                  <td className="font-medium">{row.name}</td>
                  <td className="text-slate-500">{row.batchNames || "-"}</td>
                  <td>{row.totalPoints}</td>
                  <td>{row.quizScore}</td>
                  <td>{row.tournamentPoints}</td>
                  <td>{row.homeworkCompleted}</td>
                  <td>{row.accuracy}%</td>
                  <td>{row.attendance}%</td>
                  <td>{row.xp}</td>
                  <td>{row.coins}</td>
                  <td>{row.badges}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-500">No students match the selected leaderboard scope yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
