"use client";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { AtSign, Eye, EyeOff, LockKeyhole, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const submittedRef = useRef(false);
  const clearedExistingSessionRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && !submittedRef.current && !clearedExistingSessionRef.current) {
      clearedExistingSessionRef.current = true;
      signOut({ redirect: false });
    }
  }, [status]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submittedRef.current = true;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      redirect: false,
      email: fd.get("email"),
      password: fd.get("password"),
    });
    setLoading(false);
    if (res?.error) return toast.error("Invalid email, user ID, or password");
    toast.success("Welcome back");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#812fe2] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(255,255,255,0.20),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(255,255,255,0.16),transparent_24%),linear-gradient(120deg,#7358ee_0%,#9b35df_48%,#b41fd0_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20">
        {["♛", "♞", "♜", "♟", "♚", "♝", "♘", "♕"].map((piece, index) => (
          <span
            key={`${piece}-${index}`}
            className="absolute font-serif text-7xl text-white/60"
            style={{
              left: `${[8, 16, 37, 55, 72, 84, 62, 25][index]}%`,
              top: `${[42, 88, 18, 82, 27, 56, 8, 48][index]}%`,
              transform: `rotate(${[-18, 14, 8, 4, -12, 19, -16, 22][index]}deg)`,
            }}
          >
            {piece}
          </span>
        ))}
      </div>

      <div className="relative z-10 grid min-h-screen grid-cols-1 items-center gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_526px] lg:px-14 xl:px-24">
        <section className="hidden min-h-[620px] flex-col items-center justify-center text-center lg:flex">
          <div className="rounded-[28px] border border-white/25 bg-white/15 px-10 py-7 shadow-2xl shadow-purple-950/20 backdrop-blur-md">
            <Image src="/logo-purple.svg" alt="Envision Chess Academy" width={360} height={130} priority className="h-24 w-auto object-contain opacity-95 brightness-0 invert" />
          </div>
          <h1 className="mt-12 max-w-3xl font-display text-6xl font-semibold leading-tight drop-shadow-lg">Master the Art of Chess</h1>
          <p className="mt-8 max-w-2xl text-2xl leading-relaxed text-white/90">
            Elevate your game with professional coaching, strategic analysis, and complete academy training.
          </p>
        </section>

        <section className="mx-auto w-full max-w-[526px] rounded-[28px] bg-white/95 px-7 py-9 text-slate-950 shadow-2xl shadow-purple-950/30 backdrop-blur sm:px-12 lg:py-14">
          <div className="mb-9 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-700 lg:hidden">
              <Sparkles size={22} />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome Back, Player</h2>
            <p className="mt-4 text-lg text-slate-500">Continue your journey to chess mastery</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <label className="group block">
              <span className="ml-4 bg-white px-2 text-sm font-medium text-purple-700">Email or Username</span>
              <span className="-mt-2 flex h-[70px] items-center gap-3 rounded-2xl border-2 border-purple-700 bg-white px-5 transition group-focus-within:shadow-[0_0_0_4px_rgba(126,58,242,0.12)]">
                <AtSign className="shrink-0 text-slate-600" size={28} />
                <input
                  className="h-full w-full bg-transparent text-xl text-slate-950 outline-none placeholder:text-slate-400"
                  name="email"
                  type="text"
                  placeholder="Enter your email or username"
                  required
                />
              </span>
            </label>

            <label className="group block">
              <span className="ml-4 bg-white px-2 text-sm font-medium text-slate-600">Password</span>
              <span className="-mt-2 flex h-[70px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition group-focus-within:border-purple-600 group-focus-within:shadow-[0_0_0_4px_rgba(126,58,242,0.10)]">
                <LockKeyhole className="shrink-0 text-slate-600" size={27} />
                <input
                  className="h-full w-full bg-transparent text-xl text-slate-950 outline-none placeholder:text-slate-400"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                />
                <button type="button" className="rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={27} /> : <Eye size={27} />}
                </button>
              </span>
            </label>

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-base font-medium text-purple-700 hover:text-purple-900">Forgot Password?</Link>
            </div>

            <button
              className="h-16 w-full rounded-2xl bg-gradient-to-r from-[#7040b2] to-[#51237f] text-xl font-bold text-white shadow-lg shadow-purple-900/20 transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? "Signing In..." : "Sign In to Academy"}
            </button>
          </form>

          <div className="mt-7 border-t border-slate-200 pt-6 text-center">
            <div className="font-bold">Envision Chess Academy</div>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">Professional chess coaching, analysis, classes, tournaments, and student progress tracking.</p>
            <p className="mt-5 text-sm text-slate-500">
              No account? <Link href="/register" className="font-semibold text-purple-700 hover:text-purple-900">Create one</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
