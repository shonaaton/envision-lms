"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { BriefcaseBusiness, CheckCircle2, Mail, MapPin, Phone, ShieldCheck, UserRound, UsersRound } from "lucide-react";

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
      <main className="grid min-h-screen place-items-center bg-[linear-gradient(135deg,#5a1372_0%,#8a2bc0_55%,#fff7b5_140%)] p-5">
        <section className="w-full max-w-xl rounded-[28px] bg-white p-8 text-center shadow-2xl">
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
    <main className="relative min-h-screen overflow-hidden bg-[#5a1372] px-5 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(253,231,90,0.28),transparent_28%),radial-gradient(circle_at_86%_8%,rgba(255,255,255,0.22),transparent_24%),linear-gradient(135deg,#5a1372_0%,#8a2bc0_52%,#fde75a_160%)]" />
      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_560px]">
        <section className="hidden text-white lg:block">
          <div className="inline-flex rounded-3xl border border-white/20 bg-white/15 px-8 py-6 shadow-2xl backdrop-blur">
            <Image src="/logo-purple.svg" alt="Envision Chess Academy" width={320} height={120} priority className="h-20 w-auto brightness-0 invert" />
          </div>
          <h1 className="mt-10 max-w-2xl text-6xl font-bold leading-tight">Start with the right access.</h1>
          <p className="mt-6 max-w-xl text-xl leading-relaxed text-white/85">Students begin with a safe demo workspace. Coaches apply first, then admin approval activates teaching access.</p>
        </section>

        <form onSubmit={onSubmit} className="max-h-[calc(100vh-64px)] overflow-auto rounded-[28px] bg-white/95 p-7 text-slate-950 shadow-2xl shadow-brand-900/30 backdrop-blur sm:p-9">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-brand"><ShieldCheck size={23} /></div>
            <h1 className="text-3xl font-bold">{role === "student" ? "Create Demo Student Account" : "Coach Application"}</h1>
            <p className="mt-2 text-sm text-slate-500">{role === "student" ? "Demo users get limited practice access and can create a demo booking." : "Coach applications are reviewed by admin before account activation."}</p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button type="button" onClick={() => setRole("student")} className={`rounded-xl px-4 py-3 text-sm font-bold ${role === "student" ? "bg-white text-brand shadow" : "text-slate-600"}`}>
              <UsersRound size={16} className="mr-2 inline" /> Student Demo
            </button>
            <button type="button" onClick={() => setRole("instructor")} className={`rounded-xl px-4 py-3 text-sm font-bold ${role === "instructor" ? "bg-white text-brand shadow" : "text-slate-600"}`}>
              <BriefcaseBusiness size={16} className="mr-2 inline" /> Coach Application
            </button>
          </div>

          <div className="grid gap-4">
            <IconInput icon={<UserRound size={19} />} name="name" placeholder={role === "student" ? "Student name" : "Full name"} required />
            {role === "student" && <IconInput icon={<UserRound size={19} />} name="parentName" placeholder="Parent name" required />}
            <IconInput icon={<Mail size={19} />} name="email" type="email" placeholder="Email" required />
            <div className="grid grid-cols-[128px_1fr] gap-2">
              <select name="countryCode" defaultValue="+91" className="h-12 rounded-xl border border-brand/15 bg-white px-3 text-sm">
                {countries.map((item) => <option key={`${item.code}-${item.country}`} value={item.code}>{item.code}</option>)}
              </select>
              <IconInput icon={<Phone size={19} />} name="phone" placeholder="Phone number" required />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <IconInput icon={<MapPin size={19} />} name="city" placeholder="City" required />
              <select name="country" required className="h-12 rounded-xl border border-brand/15 bg-white px-3 text-sm">
                <option value="">Country</option>
                {countries.map((item) => <option key={item.country} value={item.country}>{item.country}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>

            {role === "student" ? (
              <select name="level" required className="h-12 rounded-xl border border-brand/15 bg-white px-3 text-sm">
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
                <textarea name="coachExperience" required className="min-h-24 rounded-xl border border-brand/15 px-3 py-3 text-sm outline-none focus:border-brand" placeholder="Coaching experience, certifications, students taught..." />
                <textarea name="preferredStudents" className="min-h-20 rounded-xl border border-brand/15 px-3 py-3 text-sm outline-none focus:border-brand" placeholder="Preferred student levels / age groups" />
                <textarea name="availabilityNote" className="min-h-20 rounded-xl border border-brand/15 px-3 py-3 text-sm outline-none focus:border-brand" placeholder="General availability note" />
                <textarea name="message" className="min-h-20 rounded-xl border border-brand/15 px-3 py-3 text-sm outline-none focus:border-brand" placeholder="Anything else admin should know" />
              </>
            )}

            <IconInput icon={<ShieldCheck size={19} />} name="password" type="password" placeholder="Password (min 8)" required minLength={8} />

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <PolicyCheck name="acceptedPrivacy" label="I accept the Privacy Policy" href="https://www.envisionchessacademy.com/privacy-policy" />
              <PolicyCheck name="acceptedTerms" label="I accept the Terms and Conditions" href="https://www.envisionchessacademy.com/terms-and-conditions" />
              <PolicyCheck name="acceptedRefund" label="I accept the Refund Policy" href="https://www.envisionchessacademy.com/refund-policy" />
            </div>
          </div>

          <button className="btn-primary mt-6 h-[52px] w-full rounded-xl" disabled={loading}>{loading ? "Submitting..." : role === "student" ? "Create Demo Account" : "Submit Coach Application"}</button>
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
    <label className="flex h-12 items-center gap-3 rounded-xl border border-brand/15 bg-white px-3 text-slate-500 shadow-sm focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
      {icon}
      <input className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400" {...props} />
    </label>
  );
}

function PolicyCheck({ name, label, href }: { name: string; label: string; href: string }) {
  return (
    <label className="flex items-center gap-2 text-slate-700">
      <input name={name} type="checkbox" required className="h-4 w-4 accent-brand" />
      <span>{label} <Link href={href} target="_blank" className="font-semibold text-brand underline">View</Link></span>
    </label>
  );
}
