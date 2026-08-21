"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";

type AppErrorScreenProps = {
  error?: (Error & { digest?: string }) | null;
  reset?: () => void;
  title?: string;
  message?: string;
  homeHref?: string;
};

export default function AppErrorScreen({
  error,
  reset,
  title = "Something went wrong",
  message = "The page hit a temporary problem. Please try again, or go back to the dashboard.",
  homeHref = "/dashboard",
}: AppErrorScreenProps) {
  const digest = error?.digest;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff7ed,transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/92 shadow-2xl shadow-slate-200/70 backdrop-blur">
          <div className="border-b border-slate-100 bg-slate-950 px-6 py-5 text-white sm:px-8">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-slate-950">
                <AlertTriangle size={22} />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-200">Temporary issue</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-6 py-7 sm:px-8">
            <p className="max-w-2xl text-base leading-7 text-slate-650">{message}</p>

            {digest ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Error reference: <span className="font-black">{digest}</span>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              {reset ? (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  <RefreshCcw size={17} />
                  Try again
                </button>
              ) : null}
              <Link
                href={homeHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                <Home size={17} />
                Go to dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
