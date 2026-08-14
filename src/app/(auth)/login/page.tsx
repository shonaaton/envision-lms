"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import {
  ArrowRight,
  AtSign,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Receipt,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";
import { publicAchievementList } from "@/lib/achievementData";

const portalBenefits = [
  { label: "Join upcoming classes", value: "Live classroom links and schedule reminders", icon: CalendarDays },
  { label: "Complete homework", value: "Assignments, move submission, scores, and feedback", icon: Target },
  { label: "Track progress", value: "Attendance, tournaments, credits, and invoices", icon: Trophy },
];

const achievementSlides = publicAchievementList().slice(0, 8);
const rememberedLoginKey = "envision:remembered-login";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const submittedRef = useRef(false);
  const clearedExistingSessionRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [achievementIndex, setAchievementIndex] = useState(0);
  const activeAchievement = achievementSlides[achievementIndex] || achievementSlides[0];

  useEffect(() => {
    if (status === "authenticated" && !submittedRef.current && !clearedExistingSessionRef.current) {
      clearedExistingSessionRef.current = true;
      signOut({ redirect: false });
    }
  }, [status]);

  useEffect(() => {
    const rememberedLogin = window.localStorage.getItem(rememberedLoginKey);
    if (rememberedLogin) {
      setLoginId(rememberedLogin);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (achievementSlides.length < 2) return;
    const timer = window.setInterval(() => {
      setAchievementIndex((current) => (current + 1) % achievementSlides.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submittedRef.current = true;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password: fd.get("password"),
    });
    setLoading(false);
    if (res?.error) return toast.error("Invalid email, user ID, or password");
    if (rememberMe) {
      window.localStorage.setItem(rememberedLoginKey, email);
    } else {
      window.localStorage.removeItem(rememberedLoginKey);
    }
    toast.success("Welcome back");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <section className="order-2 bg-[#17051f] px-5 py-8 text-white sm:px-8 lg:order-1 lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
          <div className="hidden lg:block">
            <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={300} height={98} priority unoptimized className="h-20 w-auto object-contain" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr] lg:items-end">
            {activeAchievement && (
              <div className="overflow-hidden rounded-lg border border-accent/25 bg-white/[0.08] shadow-2xl shadow-black/25">
                <div className="relative aspect-[0.9] min-h-[300px] bg-[#090b10]">
                  <Image
                    key={`${activeAchievement.achievementImageUrl}-login-bg`}
                    src={activeAchievement.achievementImageUrl}
                    alt=""
                    fill
                    priority
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="scale-110 object-cover opacity-25 blur-2xl transition duration-700"
                  />
                  <Image
                    key={activeAchievement.achievementImageUrl}
                    src={activeAchievement.achievementImageUrl}
                    alt={`${activeAchievement.studentName} achievement`}
                    fill
                    priority
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-contain p-4 transition duration-700"
                  />
                  <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-black uppercase text-brand-900">
                    <Trophy size={14} /> Achievers wall
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-accent">{activeAchievement.result}</div>
                  <div className="mt-1 text-lg font-black leading-tight">{activeAchievement.studentName}</div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/68">{activeAchievement.tournamentName}</p>
                  <div className="mt-4 flex gap-1.5" aria-label="Achievement slide selector">
                    {achievementSlides.map((slide, slideIndex) => (
                      <button
                        key={`${slide.sourceImageName}-dot`}
                        type="button"
                        onClick={() => setAchievementIndex(slideIndex)}
                        className={`h-2 rounded-full transition ${slideIndex === achievementIndex ? "w-7 bg-accent" : "w-2 bg-white/35 hover:bg-white/60"}`}
                        aria-label={`Show ${slide.studentName} achievement`}
                        aria-current={slideIndex === achievementIndex}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-accent">
                <Sparkles size={15} /> Student achievers on every login
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight text-white xl:text-5xl">
                See what focused practice can become.
              </h1>
              <p className="mt-4 text-base leading-7 text-white/72">
                Every sign-in now opens with real Envision achievements, so students return to class feeling proud, motivated, and ready for the next milestone.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {achievementSlides.slice(0, 4).map((slide, slideIndex) => (
                  <button
                    key={`${slide.sourceImageName}-preview`}
                    type="button"
                    onClick={() => setAchievementIndex(slideIndex)}
                    className={`grid grid-cols-[46px_minmax(0,1fr)] items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-white/[0.12] ${
                      slideIndex === achievementIndex ? "border-accent/60 bg-white/[0.12]" : "border-white/10 bg-white/[0.06]"
                    }`}
                  >
                    <span className="relative h-12 w-12 overflow-hidden rounded-md bg-black/30">
                      <Image src={slide.achievementImageUrl} alt="" fill sizes="48px" className="object-contain p-1" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-white">{slide.studentName}</span>
                      <span className="block truncate text-xs text-white/60">{slide.achievementLevel}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:mt-10">
            {portalBenefits.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-white/12 bg-white/[0.08] p-4">
                  <Icon size={19} className="text-accent" />
                  <div className="mt-3 text-sm font-black text-white">{item.label}</div>
                  <div className="mt-1 text-xs leading-5 text-white/65">{item.value}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="order-1 flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:order-2">
          <div className="w-full max-w-[520px]">
            <div className="mb-5 flex justify-center lg:hidden">
              <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={240} height={84} priority unoptimized className="h-16 w-auto object-contain" />
            </div>

            {activeAchievement && (
              <div className="mb-4 rounded-lg border border-brand/10 bg-white p-3 shadow-sm lg:hidden">
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-950">
                  <Image src={activeAchievement.achievementImageUrl} alt={`${activeAchievement.studentName} achievement preview`} fill sizes="64px" className="object-contain p-1" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-brand">Today&apos;s achiever</div>
                  <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">{activeAchievement.studentName}: {activeAchievement.result}</p>
                </div>
              </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-brand-900/10 sm:p-8">
              <div className="mb-7">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-brand">
                  <ShieldCheck size={23} />
                </div>
                <h2 className="text-3xl font-black tracking-normal text-slate-950">Login to your portal</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Use your registered email, username, or academy login ID.</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Email, username, or login ID</span>
                  <span className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                    <AtSign className="shrink-0" size={20} />
                    <input
                      className="h-full w-full bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
                      name="email"
                      type="text"
                      autoComplete="username"
                      placeholder="name@example.com"
                      value={loginId}
                      onChange={(event) => setLoginId(event.target.value)}
                      required
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                  <span className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                    <LockKeyhole className="shrink-0" size={20} />
                    <input
                      className="h-full w-full bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </span>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      name="remember"
                      className="h-4 w-4 rounded border-slate-300 accent-brand"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    Remember me
                  </label>
                  <Link href="/forgot-password" className="text-sm font-semibold text-brand hover:text-brand-700">
                    Forgot password?
                  </Link>
                </div>

                <button className="btn-primary h-12 w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in securely"} {!loading && <ArrowRight size={17} />}
                </button>
              </form>

              <div className="mt-6 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {[
                  [BellRing, "Upcoming class reminders and coach replies"],
                  [Receipt, "Credits, invoices, and payment history"],
                  [CheckCircle2, "Secure access for academy records"],
                ].map(([Icon, text]) => (
                  <div key={String(text)} className="flex items-center gap-2">
                    <Icon size={16} className="text-brand" />
                    {text as string}
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5 text-center">
                <p className="text-sm text-slate-500">
                  New to Envision? <Link href="/register" className="font-semibold text-brand hover:text-brand-700">Create a demo account</Link>
                </p>
                <Link href="/register" className="mt-3 inline-flex text-sm font-black text-brand">
                  Book a trial class <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
