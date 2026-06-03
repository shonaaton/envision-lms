import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { Booking } from "@/models/Booking";
import Link from "next/link";
import { Calendar, BookOpen, FileText } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role as "student" | "instructor" | "admin";

  await dbConnect();
  const classroomFilter = role === "instructor" ? { instructor: userId } : role === "student" ? { students: userId } : {};
  const [classrooms, openHomework, upcomingBookings] = await Promise.all([
    Classroom.find(classroomFilter).limit(6).lean(),
    Homework.find(classroomFilter.students ? { classroom: { $in: [] } } : {}).limit(5).lean(),
    Booking.find({ $or: [{ student: userId }, { instructor: userId }], startAt: { $gte: new Date() } })
      .sort({ startAt: 1 })
      .limit(5)
      .lean(),
  ]);

  const tiles = [
    { label: "Classrooms", value: classrooms.length, icon: BookOpen, href: "/classrooms" },
    { label: "Open Homework", value: openHomework.length, icon: FileText, href: "/homework" },
    { label: "Upcoming Sessions", value: upcomingBookings.length, icon: Calendar, href: "/booking" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-accent">Dashboard</h1>
        <p className="text-sm text-gray-400">Your snapshot of academy activity.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card-hover flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">{t.label}</div>
              <div className="mt-1 text-3xl font-bold text-white">{t.value}</div>
            </div>
            <t.icon className="text-accent" size={32} />
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Your classrooms</h2>
        {classrooms.length === 0 ? (
          <div className="card text-sm text-gray-400">No classrooms yet. {role === "instructor" && <Link href="/classrooms/new" className="text-accent underline">Create one</Link>}</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {classrooms.map((c: any) => (
              <Link key={c._id} href={`/classrooms/${c._id}`} className="card-hover">
                <div className="text-white font-semibold">{c.title}</div>
                <div className="mt-1 text-xs text-gray-400">{c.level}</div>
                {c.description && <p className="mt-2 line-clamp-2 text-sm text-gray-300">{c.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
