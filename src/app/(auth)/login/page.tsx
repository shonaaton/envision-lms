"use client";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { ArrowRight, AtSign, Eye, EyeOff, LockKeyhole, MonitorSmartphone } from "lucide-react";

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
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,540px)]">
        <section className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#451059_0%,#2a0936_62%,#14051c_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div>
            <Image src="/logo-yellow.svg" alt="Envision Chess Academy" width={280} height={90} priority className="h-20 w-auto object-contain" />
            <h1 className="mt-12 max-w-2xl text-5xl font-black leading-tight">Master the art of chess with one calm workspace.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/75">
              Classes, homework, PGNs, tournaments, attendance, bookings, and payments stay connected for students, coaches, and admins.
            </p>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            {["Live classes", "Smart practice", "Progress reports"].map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/[0.08] p-4 text-sm font-bold text-white/90">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[480px]">
            <div className="mb-6 flex justify-center lg:hidden">
              <Image src="/logo-purple.svg" alt="Envision Chess Academy" width={230} height={78} priority className="h-16 w-auto object-contain" />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-brand-900/10 sm:p-8">
              <div className="mb-7">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <MonitorSmartphone size={22} />
                </div>
                <h2 className="text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Continue your academy journey from any device.</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Email or username</span>
                  <span className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                    <AtSign className="shrink-0" size={20} />
                    <input
                      className="h-full w-full bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
                      name="email"
                      type="text"
                      autoComplete="username"
                      placeholder="Enter email or username"
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
                      placeholder="Enter password"
                      required
                    />
                    <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </span>
                </label>

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm font-semibold text-brand hover:text-brand-700">Forgot password?</Link>
                </div>

                <button className="btn-primary h-12 w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"} {!loading && <ArrowRight size={17} />}
                </button>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-5 text-center">
                <p className="text-sm text-slate-500">
                  No account? <Link href="/register" className="font-semibold text-brand hover:text-brand-700">Create one</Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
