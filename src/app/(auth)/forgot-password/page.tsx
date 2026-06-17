"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, AtSign, MailQuestion } from "lucide-react";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const response = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: fd.get("login") }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return toast.error(data.error || "Could not send reset email");
    toast.success(data.message || "Reset instructions sent");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#812fe2] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(255,255,255,0.20),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(255,255,255,0.16),transparent_24%),linear-gradient(120deg,#7358ee_0%,#9b35df_48%,#b41fd0_100%)]" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8">
        <section className="w-full max-w-[520px] rounded-[28px] bg-white/95 px-7 py-9 text-slate-950 shadow-2xl shadow-purple-950/30 backdrop-blur sm:px-12 lg:py-14">
          <div className="mb-9 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <MailQuestion size={22} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
            <p className="mt-4 text-lg text-slate-500">Enter your email or username and we’ll send you a secure reset link.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <label className="group block">
              <span className="ml-4 bg-white px-2 text-sm font-medium text-purple-700">Email or Username</span>
              <span className="-mt-2 flex h-[70px] items-center gap-3 rounded-2xl border-2 border-purple-700 bg-white px-5 transition group-focus-within:shadow-[0_0_0_4px_rgba(126,58,242,0.12)]">
                <AtSign className="shrink-0 text-slate-600" size={28} />
                <input
                  className="h-full w-full bg-transparent text-xl text-slate-950 outline-none placeholder:text-slate-400"
                  name="login"
                  type="text"
                  placeholder="Enter your email or username"
                  required
                />
              </span>
            </label>

            <button
              className="h-16 w-full rounded-2xl bg-gradient-to-r from-[#7040b2] to-[#51237f] text-xl font-bold text-white shadow-lg shadow-purple-900/20 transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <div className="mt-7 border-t border-slate-200 pt-6">
            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-purple-700 hover:text-purple-900">
              <ArrowLeft size={16} />
              Back to sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
