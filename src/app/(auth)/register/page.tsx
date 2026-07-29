"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { BookOpen, BriefcaseBusiness, CalendarDays, CheckCircle2, Mail, MapPin, Phone, ShieldCheck, Target, UserRound, UsersRound } from "lucide-react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";

const countries = [
  { code: "+91", country: "India" },
  { code: "+1", country: "United States / Canada" },
  { code: "+44", country: "United Kingdom" },
  { code: "+61", country: "Australia" },
  { code: "+65", country: "Singapore" },
  { code: "+971", country: "United Arab Emirates" },
  { code: "+974", country: "Qatar" },
  { code: "+966", country: "Saudi Arabia" },
];

const registerSteps = [
  { title: "Free demo", detail: "Start with a level check and batch recommendation.", icon: CalendarDays },
  { title: "Structured classes", detail: "Learn through levels, coach notes, and practice sessions.", icon: BookOpen },
  { title: "Keep improving", detail: "Use homework, puzzles, and feedback between classes.", icon: Target },
];

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<"student" | "instructor">("student");
  const [applicationSent, setApplicationSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const text = (name: string) => String(fd.get(name) || "").trim();
    const countryCode = String(fd.get("countryCode") || "+91");
    const payload = {
      name: text("name"),
      parentName: text("parentName"),
      email: text("email"),
      password: text("password"),
      role,
      countryCode,
      phone: text("phone"),
      city: text("city"),
      country: text("country"),
      level: text("level"),
      acceptedPrivacy: fd.get("acceptedPrivacy") === "on",
      acceptedTerms: fd.get("acceptedTerms") === "on",
      acceptedRefund: fd.get("acceptedRefund") === "on",
      coachExperience: text("coachExperience"),
      playingLevel: text("playingLevel"),
      fideId: text("fideId"),
      rating: Number(fd.get("rating") || 0),
      preferredStudents: text("preferredStudents"),
      availabilityNote: text("availabilityNote"),
      message: text("message"),
    };
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      setLoading(false);
      return toast.error(error);
    }
    const result = await res.json();
    if (result.type === "coach_application") {
      setLoading(false);
      setApplicationSent(true);
      return;
    }
    await signIn("credentials", { redirect: false, email: payload.email, password: payload.password });
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  if (applicationSent) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fb] p-5">
        <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-2xl shadow-brand-900/10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Coach application received</h1>
          <p className="mt-3 text-slate-600">Thank you. The academy admin will review your application and contact you before any coach account is activated.</p>
          <Link href="/login" className="btn-primary mt-6 inline-flex">Back to login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-5 py-8 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-7xl items-center gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,580px)]">
        <section className="relative hidden overflow-hidden rounded-lg bg-brand-900 p-10 text-white shadow-2xl shadow-brand-900/20 lg:flex lg:min-h-[720px] lg:flex-col lg:justify-between xl:p-12">
          <Image src="/images/landing/anish-bijibilla.jpg" alt="Envision Chess Academy student achievement" fill priority sizes="48vw" className="object-cover opacity-38" />
          <div className="absolute inset-0 bg-[linear-gradient(150deg,#21062b_0%,rgba(55,11,70,0.93)_52%,rgba(23,5,31,0.76)_100%)]" />
          <div className="relative z-10">
            <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={300} height={108} priority unoptimized className="h-20 w-auto object-contain" />
            <p className="mt-12 text-sm font-bold uppercase tracking-[0.16em] text-accent">Join Envision</p>
            <h1 className="mt-3 max-w-2xl text-5xl font-black leading-tight">Begin with a demo, then grow through a clear chess pathway.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/75">Students get a guided start. Coaches apply first, then admin approval activates teaching access.</p>
          </div>
          <div className="relative z-10 grid gap-3">
            {registerSteps.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3 rounded-lg border border-white/12 bg-white/[0.09] p-4 backdrop-blur">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-brand">
                    <Icon size={19} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-white">{item.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-white/70">{item.detail}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl shadow-brand-900/10 sm:p-7 lg:max-h-[calc(100dvh-64px)] lg:overflow-auto">
          <div className="mb-5 flex justify-center lg:hidden">
            <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={230} height={78} priority unoptimized className="h-16 w-auto object-contain" />
          </div>
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-brand"><ShieldCheck size={23} /></div>
            <h1 className="text-2xl font-black sm:text-3xl">{role === "student" ? "Create Demo Student Account" : "Coach Application"}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">{role === "student" ? "Create access for the demo journey, practice area, and class booking flow." : "Coach applications are reviewed by admin before teaching access is activated."}</p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => setRole("student")} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${role === "student" ? "bg-white text-brand shadow" : "text-slate-600 hover:bg-white/70"}`}>
              <UsersRound size={16} className="mr-2 inline" /> Student Demo
            </button>
            <button type="button" onClick={() => setRole("instructor")} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${role === "instructor" ? "bg-white text-brand shadow" : "text-slate-600 hover:bg-white/70"}`}>
              <BriefcaseBusiness size={16} className="mr-2 inline" /> Coach Application
            </button>
          </div>

          <div className="grid gap-4">
            <IconInput icon={<UserRound size={19} />} name="name" placeholder={role === "student" ? "Student name" : "Full name"} required />
            {role === "student" && <IconInput icon={<UserRound size={19} />} name="parentName" placeholder="Parent name" required />}
            <IconInput icon={<Mail size={19} />} name="email" type="email" placeholder="Email" required />
            <div className="grid grid-cols-[128px_1fr] gap-2">
              <select name="countryCode" defaultValue="+91" className="h-12 rounded-lg border border-brand/15 bg-white px-3 text-sm">
                {countries.map((item) => <option key={`${item.code}-${item.country}`} value={item.code}>{item.code}</option>)}
              </select>
              <IconInput icon={<Phone size={19} />} name="phone" placeholder="Phone number" required />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <IconInput icon={<MapPin size={19} />} name="city" placeholder="City" required />
              <select name="country" required className="h-12 rounded-lg border border-brand/15 bg-white px-3 text-sm">
                <option value="">Country</option>
                {countries.map((item) => <option key={item.country} value={item.country}>{item.country}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>

            {role === "student" ? (
              <select name="level" required className="h-12 rounded-lg border border-brand/15 bg-white px-3 text-sm">
                <option value="">Current chess level</option>
                <option value="absolute_beginner">Absolute Beginner</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="federated">Federated Player</option>
              </select>
            ) : (
              <>
                <IconInput icon={<ShieldCheck size={19} />} name="playingLevel" placeholder="Playing / coaching level" required />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input name="fideId" className="input h-12" placeholder="FIDE ID (optional)" />
                  <input name="rating" type="number" className="input h-12" placeholder="Rating (optional)" />
                </div>
                <textarea name="coachExperience" required className="min-h-24 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="Coaching experience, certifications, students taught..." />
                <textarea name="preferredStudents" className="min-h-20 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="Preferred student levels / age groups" />
                <textarea name="availabilityNote" className="min-h-20 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="General availability note" />
                <textarea name="message" className="min-h-20 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="Anything else admin should know" />
              </>
            )}

            <IconInput icon={<ShieldCheck size={19} />} name="password" type="password" placeholder="Password (min 8)" required minLength={8} />

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <PolicyCheck name="acceptedPrivacy" label="I accept the Privacy Policy" href="https://www.envisionchessacademy.com/privacy-policy" />
              <PolicyCheck name="acceptedTerms" label="I accept the Terms and Conditions" href="https://www.envisionchessacademy.com/terms-and-conditions" />
              <PolicyCheck name="acceptedRefund" label="I accept the Refund Policy" href="https://www.envisionchessacademy.com/refund-policy" />
            </div>
          </div>

          <button className="btn-primary mt-6 h-[52px] w-full" disabled={loading}>{loading ? "Submitting..." : role === "student" ? "Create Demo Account" : "Submit Coach Application"}</button>
          <p className="mt-5 text-center text-sm text-slate-500">
            Have an account? <Link href="/login" className="font-semibold text-brand hover:text-brand-700">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

function IconInput({ icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode }) {
  return (
    <label className="flex h-12 items-center gap-3 rounded-lg border border-brand/15 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
      {icon}
      <input className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400" {...props} />
    </label>
  );
}

function PolicyCheck({ name, label, href }: { name: string; label: string; href: string }) {
  return (
    <label className="flex items-start gap-2 text-slate-700">
      <input name={name} type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
      <span>{label} <Link href={href} target="_blank" className="font-semibold text-brand underline">View</Link></span>
    </label>
  );
}
