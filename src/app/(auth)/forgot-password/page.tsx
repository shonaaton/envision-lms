"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, AtSign, MailQuestion } from "lucide-react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";

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
    <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5 py-8 text-slate-950">
      <section className="w-full max-w-[480px]">
        <div className="mb-6 flex justify-center">
          <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={230} height={78} priority unoptimized className="h-16 w-auto object-contain" />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-brand-900/10 sm:p-8">
          <div className="mb-7">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <MailQuestion size={22} />
            </div>
            <h1 className="text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">Reset your password</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enter your email or username and we will send you a secure reset link.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Email or username</span>
              <span className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                <AtSign className="shrink-0" size={20} />
                <input
                  className="h-full w-full bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
                  name="login"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter email or username"
                  required
                />
              </span>
            </label>

            <button className="btn-primary h-12 w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-700">
              <ArrowLeft size={16} />
              Back to sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
