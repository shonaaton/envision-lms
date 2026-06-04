import Link from "next/link";
import Logo from "@/components/layout/Logo";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(253,231,90,0.35),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(90,19,114,0.18),transparent_34%),linear-gradient(180deg,#fff_0%,#fbf7ff_58%,#fff_100%)]" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="rounded-2xl border border-brand/10 bg-white/80 px-4 py-3 shadow-lg shadow-brand-900/5 backdrop-blur">
          <Logo />
        </div>
        <nav className="flex gap-2">
          <Link href="/login" className="btn-outline">Login</Link>
          <Link href="/register" className="btn-accent">Join Academy</Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pt-20 text-center">
        <span className="chip-accent mb-5 px-4 py-1.5">Premium Chess LMS</span>
        <h1 className="max-w-5xl text-6xl font-black leading-[0.98] tracking-tight text-brand md:text-7xl">Envision Chess Academy</h1>
        <p className="mt-7 max-w-3xl text-xl leading-relaxed text-slate-600">
          Classrooms, homework with chess positions, PGN library, analysis board, play vs computer, attendance, self-booking and fee collection in one polished academy workspace.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/register" className="btn-accent">Start Learning</Link>
          <Link href="/login" className="btn-outline">I&apos;m already a student</Link>
        </div>
        <div className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[
            { t: "Classrooms", d: "Live coaching sessions" },
            { t: "Homework", d: "Puzzles and assignments" },
            { t: "PGN Library", d: "Study master games" },
            { t: "Analysis Board", d: "Engine-powered review" },
          ].map((feature) => (
            <div key={feature.t} className="card-hover text-left">
              <div className="text-lg font-bold text-brand">{feature.t}</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-500">{feature.d}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mt-24 border-t border-brand/10 bg-white/70 py-6 text-center text-sm text-slate-500 backdrop-blur">
        © {new Date().getFullYear()} Envision Chess Academy
      </footer>
    </main>
  );
}
