import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import Link from "next/link";

export default async function ClassroomsPage() {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role;
  await dbConnect();
  const filter = role === "admin" ? {} : role === "instructor" ? { instructor: userId } : { students: userId };
  const list = await Classroom.find(filter).lean();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-accent">Classrooms</h1>
        {(role === "instructor" || role === "admin") && (
          <Link href="/instructor/classrooms/new" className="btn-accent">+ New Classroom</Link>
        )}
      </div>
      {list.length === 0 ? (
        <div className="card text-sm text-gray-400">No classrooms yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c: any) => (
            <Link key={c._id} href={`/classrooms/${c._id}`} className="card-hover block">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">{c.title}</div>
                  <div className="mt-1 chip">{c.level}</div>
                </div>
                {c.feePerMonth > 0 && <div className="chip-accent">₹{(c.feePerMonth / 100).toFixed(0)}/mo</div>}
              </div>
              {c.description && <p className="mt-3 line-clamp-3 text-sm text-gray-300">{c.description}</p>}
              <div className="mt-4 text-xs text-gray-500">{(c.students?.length ?? 0)} students</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
