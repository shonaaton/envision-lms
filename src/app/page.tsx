import Link from "next/link";
import Logo from "@/components/layout/Logo";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(90,19,114,0.35),transparent_60%),radial-gradient(circle_at_70%_80%,rgba(253,231,90,0.10),transparent_60%)]" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="flex gap-2">
          <Link href="/login" className="btn-ghost">Login</Link>
          <Link href="/register" className="btn-accent">Join Academy</Link>
        </nav>
      </header>
      <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pt-24 text-center">
        <h1 className="font-display text-6xl tracking-wide text-accent md:text-7xl">Envision Chess Academy</h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-300">
          Classrooms, homework with chess positions, PGN library, analysis board, play vs computer, attendance, self-booking and fee collection — all in one place.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/register" className="btn-accent">Start Learning</Link>
          <Link href="/login" className="btn-outline">I'm already a student</Link>
        </div>
        <div className="mt-20 grid w-full grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { t: "Classrooms", d: "Live coaching sessions" },
            { t: "Homework", d: "Puzzles & assignments" },
            { t: "PGN Library", d: "Study master games" },
            { t: "Analysis Board", d: "Engine-powered review" },
          ].map((f) => (
            <div key={f.t} className="card text-left">
              <div className="text-accent font-semibold">{f.t}</div>
              <div className="mt-1 text-sm text-gray-400">{f.d}</div>
            </div>
          ))}
        </div>
      </section>
      <footer className="relative z-10 mt-24 border-t border-ink-700 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Envision Chess Academy
      </footer>
    </main>
  );
}
