import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { notFound } from "next/navigation";
import Link from "next/link";
import PayButton from "@/components/PayButton";

export default async function ClassroomDetail({ params }: { params: { id: string } }) {
  const session = await auth();
  const userId = (session?.user as any).id;
  await dbConnect();
  const c: any = await Classroom.findById(params.id)
    .populate("instructor", "name email")
    .populate("students", "name email")
    .lean();
  if (!c) notFound();
  const hw = await Homework.find({ classroom: c._id }).sort({ createdAt: -1 }).limit(20).lean();
  const isStudent = c.students?.some((s: any) => s._id.toString() === userId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-accent">{c.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="chip">{c.level}</span>
            <span className="chip">Coach: {c.instructor?.name}</span>
            <span className="chip">{c.students?.length} students</span>
          </div>
        </div>
        {!isStudent && c.feePerMonth > 0 && (
          <PayButton amount={c.feePerMonth} purpose="enrollment" refId={c._id.toString()} label={`Join — ₹${(c.feePerMonth / 100).toFixed(0)}/mo`} />
        )}
      </div>
      {c.description && <p className="text-gray-300">{c.description}</p>}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Schedule</h2>
        <div className="card">
          {(c.schedule?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-400">No schedule set.</div>
          ) : (
            <ul className="space-y-1 text-sm text-gray-200">
              {c.schedule.map((s: any, i: number) => (
                <li key={i}>Day {s.dayOfWeek} • {s.startTime}–{s.endTime} {s.meetingUrl && <a href={s.meetingUrl} className="text-accent underline" target="_blank">Join</a>}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Homework</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {hw.map((h: any) => (
            <Link key={h._id} href={`/homework/${h._id}`} className="card-hover">
              <div className="text-white">{h.title}</div>
              <div className="mt-1 text-xs text-gray-400">{h.puzzles?.length ?? 0} puzzles</div>
            </Link>
          ))}
          {hw.length === 0 && <div className="card text-sm text-gray-400">No homework yet.</div>}
        </div>
      </section>
    </div>
  );
}
