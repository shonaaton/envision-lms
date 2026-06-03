import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework } from "@/models/Homework";
import { Classroom } from "@/models/Classroom";
import Link from "next/link";

export default async function HomeworkListPage() {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role;
  await dbConnect();

  let filter: any = {};
  if (role === "student") {
    const my = await Classroom.find({ students: userId }, { _id: 1 }).lean();
    filter.classroom = { $in: my.map((c: any) => c._id) };
  } else if (role === "instructor") {
    filter.instructor = userId;
  }
  const list = await Homework.find(filter).sort({ createdAt: -1 }).lean();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-accent">Homework</h1>
        {(role === "instructor" || role === "admin") && (
          <Link href="/instructor/homework/new" className="btn-accent">+ Assign Homework</Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list.map((h: any) => (
          <Link key={h._id} href={`/homework/${h._id}`} className="card-hover">
            <div className="text-white font-semibold">{h.title}</div>
            <div className="mt-1 text-xs text-gray-400">{(h.puzzles?.length ?? 0)} puzzles{h.dueAt ? ` • due ${new Date(h.dueAt).toLocaleDateString()}` : ""}</div>
            {h.description && <p className="mt-2 line-clamp-2 text-sm text-gray-300">{h.description}</p>}
          </Link>
        ))}
        {list.length === 0 && <div className="card text-sm text-gray-400">No homework yet.</div>}
      </div>
    </div>
  );
}
