"use client";
import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { Mail, Phone, ShieldCheck, UserRound } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      password: fd.get("password"),
      role: fd.get("role"),
      phone: fd.get("phone"),
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
    await signIn("credentials", { redirect: false, email: payload.email, password: payload.password });
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#5a1372] px-5 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(253,231,90,0.28),transparent_28%),radial-gradient(circle_at_86%_8%,rgba(255,255,255,0.22),transparent_24%),linear-gradient(135deg,#5a1372_0%,#8a2bc0_52%,#fde75a_160%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-15">
        {["♔", "♕", "♖", "♘", "♙"].map((piece, index) => (
          <span key={piece} className="absolute font-serif text-8xl text-white" style={{ left: `${[9, 28, 66, 82, 48][index]}%`, top: `${[18, 76, 12, 68, 42][index]}%` }}>{piece}</span>
        ))}
      </div>
      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_460px]">
        <section className="hidden text-white lg:block">
          <div className="inline-flex rounded-3xl border border-white/20 bg-white/15 px-8 py-6 shadow-2xl backdrop-blur">
            <Image src="/logo-purple.svg" alt="Envision Chess Academy" width={320} height={120} priority className="h-20 w-auto brightness-0 invert" />
          </div>
          <h1 className="mt-10 max-w-2xl text-6xl font-bold leading-tight">Join a sharper chess academy experience.</h1>
          <p className="mt-6 max-w-xl text-xl leading-relaxed text-white/85">Classrooms, homework, PGN study, tournaments, analysis tools, and progress tracking in one premium workspace.</p>
        </section>

        <form onSubmit={onSubmit} className="rounded-[28px] bg-white/95 p-7 text-slate-950 shadow-2xl shadow-brand-900/30 backdrop-blur sm:p-9">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-brand"><ShieldCheck size={23} /></div>
            <h1 className="text-3xl font-bold">Create Account</h1>
            <p className="mt-2 text-sm text-slate-500">Start your academy journey today.</p>
          </div>
          <div className="space-y-4">
            <IconInput icon={<UserRound size={19} />} name="name" placeholder="Full name" required />
            <IconInput icon={<Mail size={19} />} name="email" type="email" placeholder="Email" required />
            <IconInput icon={<Phone size={19} />} name="phone" placeholder="Phone (optional)" />
            <IconInput icon={<ShieldCheck size={19} />} name="password" type="password" placeholder="Password (min 8)" required minLength={8} />
            <select className="input h-12" name="role" defaultValue="student">
              <option value="student">I am a student</option>
              <option value="instructor">I am an instructor</option>
            </select>
          </div>
          <button className="btn-primary mt-6 h-[52px] w-full rounded-xl" disabled={loading}>{loading ? "Creating..." : "Create Academy Account"}</button>
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
