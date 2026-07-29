"use client";

import { useMemo, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Target,
  UserRound,
  UsersRound,
} from "lucide-react";
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
  { title: "Free assessment", detail: "Create a demo account and request a trial class.", icon: CalendarDays },
  { title: "Correct placement", detail: "Share current level so the academy can recommend a path.", icon: BookOpen },
  { title: "Connected portal", detail: "Use homework, practice tools, tournaments, attendance, and credits.", icon: Target },
];

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<"student" | "instructor">("student");
  const [applicationSent, setApplicationSent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const passwordScore = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast.error("Passwords do not match");
    }
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
      <main className="grid min-h-screen place-items-center bg-[#f8fafc] p-5">
        <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-2xl shadow-brand-900/10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Coach application received</h1>
          <p className="mt-3 text-slate-600">Thank you. The academy admin will review your application before teaching access is activated.</p>
          <Link href="/login" className="btn-primary mt-6 inline-flex">Back to login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(560px,1.18fr)] lg:px-8">
        <aside className="relative overflow-hidden rounded-lg bg-[#17051f] p-5 text-white shadow-2xl shadow-brand-900/20 lg:sticky lg:top-6 lg:h-[calc(100dvh-48px)] lg:p-8">
          <Image src="/images/landing/anish-bijibilla.jpg" alt="Envision Chess Academy student achievement" fill priority sizes="(min-width: 1024px) 36vw, 100vw" className="object-cover object-top opacity-30" />
          <div className="absolute inset-0 bg-[linear-gradient(150deg,#17051f_0%,rgba(50,10,64,0.94)_54%,rgba(15,5,22,0.78)_100%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={290} height={98} priority unoptimized className="h-20 w-auto object-contain" />
              <p className="mt-8 text-xs font-black uppercase tracking-[0.16em] text-accent">Guided onboarding</p>
              <h1 className="mt-3 text-4xl font-black leading-tight">Start with clarity, then grow through the portal.</h1>
              <p className="mt-4 text-sm leading-6 text-white/70">
                Students begin as demo accounts. Coaches submit applications for admin review before any teaching access is activated.
              </p>
            </div>
            <div className="mt-8 grid gap-3">
              {registerSteps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 rounded-lg border border-white/12 bg-white/[0.08] p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-sm font-black text-brand-900">
                      {index + 1}
                    </span>
                    <span>
                      <span className="flex items-center gap-2 text-sm font-black text-white"><Icon size={16} /> {item.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-white/66">{item.detail}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-brand-900/10 sm:p-7">
          <div className="mb-5 flex justify-center lg:hidden">
            <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={230} height={78} priority unoptimized className="h-16 w-auto object-contain" />
          </div>
          <div className="mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-brand"><ShieldCheck size={23} /></div>
            <h1 className="mt-4 text-3xl font-black sm:text-4xl">{role === "student" ? "Create Demo Student Account" : "Coach Application"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {role === "student"
                ? "Create access for trial booking, practice previews, and the student learning journey."
                : "Share your coaching profile. The academy reviews applications before account activation."}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => setRole("student")} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${role === "student" ? "bg-white text-brand shadow" : "text-slate-600 hover:bg-white/70"}`}>
              <UsersRound size={16} className="mr-2 inline" /> Student Demo
            </button>
            <button type="button" onClick={() => setRole("instructor")} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${role === "instructor" ? "bg-white text-brand shadow" : "text-slate-600 hover:bg-white/70"}`}>
              <BriefcaseBusiness size={16} className="mr-2 inline" /> Coach Application
            </button>
          </div>

          <div className="grid gap-5">
            <FormSection number="1" title="Account details" note="Use accurate contact details so the academy can reach you after the demo request.">
              <div className="grid gap-3 sm:grid-cols-2">
                <IconInput icon={<UserRound size={19} />} name="name" placeholder={role === "student" ? "Student name" : "Full name"} required />
                {role === "student" && <IconInput icon={<UserRound size={19} />} name="parentName" placeholder="Parent or guardian name" required />}
                <IconInput icon={<Mail size={19} />} name="email" type="email" placeholder="Email address" required autoComplete="email" />
                <div className="grid grid-cols-[124px_1fr] gap-2">
                  <select name="countryCode" defaultValue="+91" className="h-12 rounded-lg border border-brand/15 bg-white px-3 text-sm">
                    {countries.map((item) => <option key={`${item.code}-${item.country}`} value={item.code}>{item.code}</option>)}
                  </select>
                  <IconInput icon={<Phone size={19} />} name="phone" placeholder="Phone number" required autoComplete="tel" />
                </div>
              </div>
            </FormSection>

            <FormSection number="2" title={role === "student" ? "Student information" : "Coach profile"} note={role === "student" ? "This helps the academy recommend the right level and class format." : "This helps admins review your teaching fit."}>
              {role === "student" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <IconInput icon={<MapPin size={19} />} name="city" placeholder="City" required />
                  <select name="country" required className="h-12 rounded-lg border border-brand/15 bg-white px-3 text-sm">
                    <option value="">Country</option>
                    {countries.map((item) => <option key={item.country} value={item.country}>{item.country}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  <select name="level" required className="h-12 rounded-lg border border-brand/15 bg-white px-3 text-sm sm:col-span-2">
                    <option value="">Current chess level</option>
                    <option value="absolute_beginner">Absolute Beginner</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="federated">Federated Player</option>
                  </select>
                  <div className="rounded-lg border border-dashed border-brand/20 bg-brand-50 p-4 text-sm leading-6 text-brand sm:col-span-2">
                    Preferred class mode, schedule, FIDE rating, time zone, and primary learning goal can be added here once approved for backend storage.
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <IconInput icon={<MapPin size={19} />} name="city" placeholder="City" required />
                    <select name="country" required className="h-12 rounded-lg border border-brand/15 bg-white px-3 text-sm">
                      <option value="">Country</option>
                      {countries.map((item) => <option key={item.country} value={item.country}>{item.country}</option>)}
                      <option value="Other">Other</option>
                    </select>
                    <IconInput icon={<ShieldCheck size={19} />} name="playingLevel" placeholder="Playing / coaching level" required />
                    <input name="fideId" className="input h-12" placeholder="FIDE ID (optional)" />
                    <input name="rating" type="number" className="input h-12" placeholder="Rating (optional)" />
                  </div>
                  <textarea name="coachExperience" required className="min-h-24 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="Coaching experience, certifications, students taught..." />
                  <textarea name="preferredStudents" className="min-h-20 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="Preferred student levels / age groups" />
                  <textarea name="availabilityNote" className="min-h-20 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="General availability note" />
                  <textarea name="message" className="min-h-20 rounded-lg border border-brand/15 px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="Anything else admin should know" />
                </div>
              )}
            </FormSection>

            <FormSection number="3" title="Security and consent" note="Password and policy acknowledgements are required before the account can be created.">
              <div className="grid gap-3 sm:grid-cols-2">
                <PasswordInput name="password" value={password} onChange={(event) => setPassword(event.target.value)} show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
                <PasswordInput name="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} show={showPassword} placeholder="Confirm password" />
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-slate-700">Password strength</span>
                  <span className="font-semibold text-slate-500">{["Too short", "Basic", "Good", "Strong", "Excellent"][passwordScore]}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <span key={index} className={`h-2 rounded-full ${index < passwordScore ? "bg-brand" : "bg-slate-200"}`} />
                  ))}
                </div>
                <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                  <span>Minimum 8 characters</span>
                  <span>Use numbers or symbols for stronger security</span>
                </div>
              </div>

              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <PolicyCheck name="acceptedPrivacy" label="I accept the Privacy Policy" href="https://www.envisionchessacademy.com/privacy-policy" />
                <PolicyCheck name="acceptedTerms" label="I accept the Terms and Conditions" href="https://www.envisionchessacademy.com/terms-and-conditions" />
                <PolicyCheck name="acceptedRefund" label="I accept the Refund Policy" href="https://www.envisionchessacademy.com/refund-policy" />
                {role === "student" && <PlainCheck required label="I confirm this account is being created with parent or guardian consent where required." />}
                <PlainCheck label="I would like to receive academy updates and event announcements. Optional." />
              </div>
            </FormSection>
          </div>

          <button className="btn-primary mt-6 h-[52px] w-full" disabled={loading}>
            {loading ? "Submitting..." : role === "student" ? "Create Demo Account" : "Submit Coach Application"} <ArrowRight size={17} />
          </button>
          <p className="mt-5 text-center text-sm text-slate-500">
            Have an account? <Link href="/login" className="font-semibold text-brand hover:text-brand-700">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

function FormSection({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-[#fbfcff] p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-sm font-black text-white">{number}</span>
        <span>
          <span className="block font-black text-slate-950">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-slate-500">{note}</span>
        </span>
      </div>
      {children}
    </section>
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

function PasswordInput({
  show,
  onToggle,
  placeholder = "Password (min 8)",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { show: boolean; onToggle?: () => void }) {
  return (
    <label className="flex h-12 items-center gap-3 rounded-lg border border-brand/15 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
      <ShieldCheck size={19} />
      <input
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
        type={show ? "text" : "password"}
        placeholder={placeholder}
        required
        minLength={8}
        autoComplete="new-password"
        {...props}
      />
      {onToggle && (
        <button type="button" onClick={onToggle} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
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

function PlainCheck({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-slate-700">
      <input type="checkbox" required={required} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
      <span>{label}</span>
    </label>
  );
}
