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
  Target,
  Trophy,
} from "lucide-react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";

const portalBenefits = [
  { label: "Join upcoming classes", value: "Live classroom links and schedule reminders", icon: CalendarDays },
  { label: "Complete homework", value: "Assignments, move submission, scores, and feedback", icon: Target },
  { label: "Track progress", value: "Attendance, tournaments, credits, and invoices", icon: Trophy },
];

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

          <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-end">
            <div className="overflow-hidden rounded-lg border border-accent/25 bg-white/[0.08] shadow-2xl shadow-black/25">
              <div className="relative aspect-[0.86] min-h-[260px]">
                <Image src="/images/landing/anish-bijibilla.jpg" alt="Envision Chess Academy student achievement" fill priority sizes="(min-width: 1024px) 31vw, 100vw" className="object-cover object-top" />
              </div>
              <div className="p-4">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-accent">Achievement Access</div>
                <div className="mt-1 font-black">Welcome Back to Your Chess Journey</div>
              </div>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Student, coach, and admin portal</p>
              <h1 className="mt-3 text-4xl font-black leading-tight text-white xl:text-5xl">
                Continue classes, homework, practice, and progress in one place.
              </h1>
              <p className="mt-4 text-base leading-7 text-white/72">
                Log in to reach live classrooms, assignments, tournaments, communication, credits, payment history, and academy updates.
              </p>
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

            <div className="mb-4 rounded-lg border border-brand/10 bg-white p-3 shadow-sm lg:hidden">
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                  <Image src="/images/landing/anish-bijibilla.jpg" alt="Student achievement preview" fill sizes="64px" className="object-cover object-top" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-brand">Portal preview</div>
                  <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">Classes, homework, practice, tournaments, and payments after login.</p>
                </div>
              </div>
            </div>

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
