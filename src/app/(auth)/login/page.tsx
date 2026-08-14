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

const achievementSlides = publicAchievementList();
const rememberedLoginKey = "envision:remembered-login";

function shuffledAchievements() {
  return [...achievementSlides].sort(() => Math.random() - 0.5);
}

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const submittedRef = useRef(false);
  const clearedExistingSessionRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [randomizedAchievements, setRandomizedAchievements] = useState(achievementSlides);
  const [achievementIndex, setAchievementIndex] = useState(0);
  const activeAchievement = randomizedAchievements[achievementIndex] || randomizedAchievements[0];
  const previousAchievement =
    randomizedAchievements[(achievementIndex - 1 + randomizedAchievements.length) % randomizedAchievements.length] || activeAchievement;
  const nextAchievement = randomizedAchievements[(achievementIndex + 1) % randomizedAchievements.length] || activeAchievement;

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
    setRandomizedAchievements(shuffledAchievements());
    setAchievementIndex(0);
  }, []);

  useEffect(() => {
    if (randomizedAchievements.length < 2) return;
    const timer = window.setInterval(() => {
      setAchievementIndex((current) => (current + 1) % randomizedAchievements.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [randomizedAchievements.length]);

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
    <main className="min-h-screen bg-[#f4f6f9] text-slate-950 lg:bg-[linear-gradient(90deg,#141922_0%,#151522_46%,#eef2f7_54%,#f7f8fb_100%)]">
      <div className="grid min-h-screen lg:h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.92fr)] lg:overflow-hidden">
        <section className="relative order-2 overflow-hidden bg-[#120818] px-5 py-7 text-white sm:px-8 lg:order-1 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:bg-transparent lg:p-7 xl:p-8">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(253,231,90,0.08)_0%,transparent_24%,rgba(18,126,112,0.12)_52%,transparent_74%),linear-gradient(180deg,rgba(24,5,31,0.92)_0%,rgba(16,24,39,0.94)_100%)]" />
          <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(120deg,rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(30deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:76px_76px]" />
          <div className="absolute -left-20 top-20 h-36 w-[140%] -rotate-6 border-y border-white/10 bg-white/[0.02]" />
          <div className="relative hidden lg:block">
            <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={240} height={78} priority unoptimized className="h-14 w-auto object-contain opacity-95" />
          </div>

          <div className="relative grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            {activeAchievement && (
              <div className="relative mx-auto w-full max-w-[390px] py-2 pr-3 [perspective:1200px]">
                <div className="absolute left-1/2 top-8 h-[76%] w-[70%] -translate-x-[64%] -rotate-[8deg] skew-y-2 border border-cyan-300/12 bg-cyan-300/[0.04] shadow-xl shadow-cyan-950/30" />
                <div className="absolute left-1/2 top-9 h-[76%] w-[70%] -translate-x-[28%] rotate-[7deg] skew-y-[-2deg] border border-accent/12 bg-accent/[0.045] shadow-xl shadow-black/25" />
                {previousAchievement && (
                  <div className="absolute left-0 top-12 hidden h-[54%] w-[38%] -rotate-[10deg] overflow-hidden border border-white/10 bg-black/25 opacity-45 shadow-xl shadow-black/30 sm:block">
                    <Image src={previousAchievement.achievementImageUrl} alt="" fill sizes="180px" className="object-cover" />
                  </div>
                )}
                {nextAchievement && (
                  <div className="absolute right-0 top-8 hidden h-[56%] w-[38%] rotate-[10deg] overflow-hidden border border-white/10 bg-black/25 opacity-52 shadow-xl shadow-black/30 sm:block">
                    <Image src={nextAchievement.achievementImageUrl} alt="" fill sizes="180px" className="object-cover" />
                  </div>
                )}

                <div className="relative z-10 rotate-[-2deg] transform-gpu transition duration-700 hover:rotate-0 hover:scale-[1.015] [transform-style:preserve-3d]">
                  <div className="absolute -inset-2 translate-y-4 rotate-3 bg-black/28 blur-xl" />
                  <div className="relative overflow-hidden border border-white/14 bg-[#080b11]/82 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur">
                    <div className="relative aspect-[0.9] min-h-[255px] max-h-[360px]">
                      <Image
                        key={`${activeAchievement.achievementImageUrl}-login-bg`}
                        src={activeAchievement.achievementImageUrl}
                        alt=""
                        fill
                        priority
                        sizes="(min-width: 1024px) 34vw, 100vw"
                        className="scale-125 object-cover opacity-22 blur-2xl transition duration-700"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.20)_0%,transparent_18%,transparent_58%,rgba(20,184,166,0.18)_100%)]" />
                      <Image
                        key={activeAchievement.achievementImageUrl}
                        src={activeAchievement.achievementImageUrl}
                        alt={`${activeAchievement.studentName} achievement`}
                        fill
                        priority
                        sizes="(min-width: 1024px) 34vw, 100vw"
                        className="object-contain p-3 drop-shadow-2xl transition duration-700"
                      />
                      <div className="absolute left-3 top-3 inline-flex items-center gap-2 bg-accent/95 px-2.5 py-1 text-[10px] font-black uppercase text-brand-900 shadow-lg shadow-accent/10">
                        <Trophy size={14} /> Achievers wall
                      </div>
                    </div>
                    <div className="border-t border-white/10 bg-[#070b10]/92 px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-accent">{activeAchievement.result}</div>
                      <div className="mt-1 text-lg font-black leading-tight text-white">{activeAchievement.studentName}</div>
                      <p className="mt-1 line-clamp-1 text-xs leading-5 text-white/62">{activeAchievement.tournamentName}</p>
                    </div>
                  </div>
                </div>

                <div className="relative z-20 mx-auto mt-3 max-w-[92%]">
                  <div className="flex max-h-8 flex-wrap justify-center gap-1.5 overflow-hidden" aria-label="Achievement slide selector">
                    {randomizedAchievements.map((slide, slideIndex) => (
                      <button
                        key={`${slide.sourceImageName}-dot`}
                        type="button"
                        onClick={() => setAchievementIndex(slideIndex)}
                        className={`h-1.5 transition ${slideIndex === achievementIndex ? "w-7 bg-accent shadow-lg shadow-accent/20" : "w-1.5 bg-white/28 hover:bg-white/50"}`}
                        aria-label={`Show ${slide.studentName} achievement`}
                        aria-current={slideIndex === achievementIndex}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="max-w-[430px] lg:pl-3 xl:pl-5">
              <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-accent">
                <Sparkles size={15} /> Student achievers on every login
              </p>
              <h1 className="mt-3 text-3xl font-black leading-[1.08] text-white xl:text-4xl">
                See what focused practice can become.
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/64">
                Every sign-in now opens with real Envision achievements, so students return to class feeling proud, motivated, and ready for the next milestone.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {randomizedAchievements.slice(0, 4).map((slide, slideIndex) => (
                  <button
                    key={`${slide.sourceImageName}-preview`}
                    type="button"
                    onClick={() => setAchievementIndex(slideIndex)}
                    className={`group grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2 border-l p-2 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.075] ${
                      slideIndex === achievementIndex ? "border-accent bg-white/[0.075]" : "border-white/12 bg-white/[0.03]"
                    }`}
                  >
                    <span className="relative h-10 w-10 overflow-hidden bg-black/25 shadow-lg shadow-black/20 transition group-hover:rotate-2">
                      <Image src={slide.achievementImageUrl} alt="" fill sizes="48px" className="object-cover" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black text-white">{slide.studentName}</span>
                      <span className="block truncate text-xs text-white/60">{slide.achievementLevel}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative mt-4 grid gap-2 border-y border-white/10 bg-white/[0.025] py-3 sm:grid-cols-3">
            {portalBenefits.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="px-2">
                  <Icon size={16} className="text-accent" />
                  <div className="mt-2 text-xs font-black text-white">{item.label}</div>
                  <div className="mt-1 text-[11px] leading-4 text-white/55">{item.value}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="order-1 flex min-h-screen items-center justify-center bg-[#f7f8fb]/94 px-5 py-6 sm:px-8 lg:order-2 lg:h-screen lg:min-h-0 lg:bg-transparent">
          <div className="w-full max-w-[470px]">
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

            <div className="border border-slate-200/80 bg-white/[0.92] p-5 shadow-xl shadow-brand-900/10 backdrop-blur sm:p-6">
              <div className="mb-5">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center bg-accent/90 text-brand">
                  <ShieldCheck size={20} />
                </div>
                <h2 className="text-2xl font-black tracking-normal text-slate-950">Login to your portal</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Use your registered email, username, or academy login ID.</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Email, username, or login ID</span>
                  <span className="flex h-11 items-center gap-3 border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
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
                  <span className="flex h-11 items-center gap-3 border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
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

                <button className="btn-primary h-11 w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in securely"} {!loading && <ArrowRight size={17} />}
                </button>
              </form>

              <div className="mt-5 grid gap-2 border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600">
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

              <div className="mt-5 border-t border-slate-200 pt-4 text-center">
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
