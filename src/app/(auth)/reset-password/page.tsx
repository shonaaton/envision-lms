"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const token = searchParams.get("token") || "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return toast.error("This reset link is incomplete.");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const response = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password: fd.get("password"),
        confirmPassword: fd.get("confirmPassword"),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return toast.error(data.error || "Could not reset password");
    toast.success("Password updated. You can sign in now.");
    router.push("/login");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#812fe2] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(255,255,255,0.20),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(255,255,255,0.16),transparent_24%),linear-gradient(120deg,#7358ee_0%,#9b35df_48%,#b41fd0_100%)]" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8">
        <section className="w-full max-w-[520px] rounded-[28px] bg-white/95 px-7 py-9 text-slate-950 shadow-2xl shadow-purple-950/30 backdrop-blur sm:px-12 lg:py-14">
          <div className="mb-9 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <KeyRound size={22} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
            <p className="mt-4 text-lg text-slate-500">Set a fresh password for your academy account.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <PasswordField
              name="password"
              label="New Password"
              placeholder="Enter your new password"
              show={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
            <PasswordField
              name="confirmPassword"
              label="Confirm Password"
              placeholder="Re-enter your new password"
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((value) => !value)}
            />

            <button
              className="h-16 w-full rounded-2xl bg-gradient-to-r from-[#7040b2] to-[#51237f] text-xl font-bold text-white shadow-lg shadow-purple-900/20 transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? "Updating..." : "Reset Password"}
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

function PasswordField({
  name,
  label,
  placeholder,
  show,
  onToggle,
}: {
  name: string;
  label: string;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="group block">
      <span className="ml-4 bg-white px-2 text-sm font-medium text-slate-600">{label}</span>
      <span className="-mt-2 flex h-[70px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition group-focus-within:border-purple-600 group-focus-within:shadow-[0_0_0_4px_rgba(126,58,242,0.10)]">
        <KeyRound className="shrink-0 text-slate-600" size={24} />
        <input
          className="h-full w-full bg-transparent text-xl text-slate-950 outline-none placeholder:text-slate-400"
          name={name}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          minLength={8}
          required
        />
        <button type="button" className="rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff size={24} /> : <Eye size={24} />}
        </button>
      </span>
    </label>
  );
}
