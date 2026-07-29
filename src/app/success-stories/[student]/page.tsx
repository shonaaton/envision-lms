import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Trophy } from "lucide-react";
import { getLandingAchievements } from "@/lib/achievements";
import { publicAchievementList, studentSlug } from "@/lib/achievementData";

export const dynamic = "force-dynamic";

export default async function StudentSuccessPage({ params }: { params: { student: string } }) {
  const achievements = publicAchievementList(await getLandingAchievements()).filter((item) => studentSlug(item.studentName) === params.student);
  const primary = achievements[0];

  if (!primary) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fb] p-6 text-center">
        <div>
          <h1 className="text-3xl font-black text-slate-950">Student profile not found</h1>
          <Link href="/success-stories" className="btn-primary mt-5"><ArrowLeft size={16} /> Back to Success Stories</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <section className="bg-[#17051f] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Link href="/success-stories" className="inline-flex items-center gap-2 text-sm font-bold text-accent"><ArrowLeft size={16} /> Success Stories</Link>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-accent">Student Profile</p>
            <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">{primary.studentName}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/76">{primary.shortDescription}</p>
          </div>
          <div className="relative aspect-[1.12] overflow-hidden rounded-lg border border-white/12 bg-white/10 shadow-2xl shadow-black/25">
            <Image src={primary.achievementImageUrl} alt={`${primary.studentName} achievement`} fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Info icon={Trophy} label="Result" value={primary.result} />
          <Info icon={MapPin} label="Location" value={primary.tournamentLocation} />
          <Info icon={CalendarDays} label="Year" value={primary.year} />
        </div>
        <h2 className="text-2xl font-black text-slate-950">All achievements for {primary.studentName}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((item) => (
            <article key={`${item.tournamentName}-${item.displayOrder}`} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-brand">{item.achievementLevel}</div>
              <h3 className="mt-2 font-black text-slate-950">{item.tournamentName}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{item.result}</p>
              <p className="mt-3 text-xs text-slate-500">{item.tournamentLocation} · {item.year}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <Icon size={18} className="text-brand" />
      <div className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-black text-slate-950">{value}</div>
    </div>
  );
}
