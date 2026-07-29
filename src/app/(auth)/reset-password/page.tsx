"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking");
  const [tokenError, setTokenError] = useState("");
  const token = searchParams?.get("token") || "";

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      setTokenError("This reset link is incomplete.");
      return;
    }
    let active = true;
    fetch(`/api/password/reset?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setTokenState("invalid");
          setTokenError(data.error || "This reset link is invalid or expired.");
          return;
        }
        setTokenState("valid");
      })
      .catch(() => {
        if (!active) return;
        setTokenState("invalid");
        setTokenError("Could not verify this reset link. Please request a new one.");
      });
    return () => {
      active = false;
    };
  }, [token]);

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
    <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5 py-8 text-slate-950">
      <section className="w-full max-w-[480px]">
        <div className="mb-6 flex justify-center">
          <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={230} height={78} priority unoptimized className="h-16 w-auto object-contain" />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-brand-900/10 sm:p-8">
          <div className="mb-7">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <KeyRound size={22} />
            </div>
            <h1 className="text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">Choose a new password</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Set a fresh password for your academy account.</p>
          </div>

          {tokenState === "checking" ? (
            <div className="rounded-lg bg-brand-50 p-5 text-center font-semibold text-brand">Checking your secure reset link...</div>
          ) : tokenState === "invalid" ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-center">
              <p className="font-semibold text-rose-800">{tokenError}</p>
              <Link href="/forgot-password" className="btn-primary mt-4">
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <PasswordField
                name="password"
                label="New password"
                placeholder="Enter your new password"
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />
              <PasswordField
                name="confirmPassword"
                label="Confirm password"
                placeholder="Re-enter your new password"
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
              />

              <button className="btn-primary h-12 w-full" disabled={loading}>
                {loading ? "Updating..." : "Reset password"}
              </button>
            </form>
          )}

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
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <span className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
        <KeyRound className="shrink-0" size={20} />
        <input
          className="h-full w-full bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
          name={name}
          type={show ? "text" : "password"}
          autoComplete={name === "password" ? "new-password" : "new-password"}
          placeholder={placeholder}
          minLength={8}
          required
        />
        <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </span>
    </label>
  );
}
