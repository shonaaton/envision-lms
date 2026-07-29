import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Trophy } from "lucide-react";
import { getLandingAchievements } from "@/lib/achievements";
import { publicAchievementList, studentSlug } from "@/lib/achievementData";

export const dynamic = "force-dynamic";

export default async function SuccessStoriesPage() {
  const achievements = publicAchievementList(await getLandingAchievements());
  const students = Array.from(new Map(achievements.map((item) => [studentSlug(item.studentName), item])).values());

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <section className="bg-[#17051f] px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Student Success Stories</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">Verified student journeys from tournament floor to public record.</h1>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
        {students.map((item) => (
          <Link key={studentSlug(item.studentName)} href={`/success-stories/${studentSlug(item.studentName)}`} className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/10">
            <div className="relative aspect-[1.08] bg-slate-100">
              <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition duration-700 group-hover:scale-105" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-black text-brand">
                <Trophy size={13} /> {item.achievementLevel}
              </span>
            </div>
            <div className="p-5">
              <h2 className="text-xl font-black text-slate-950">{item.studentName}</h2>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-700">{item.result}</p>
              <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} /> {item.tournamentLocation}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-black text-brand">View Profile <ArrowRight size={15} /></span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
