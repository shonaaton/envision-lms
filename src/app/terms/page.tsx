import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ff] px-6 py-12 text-slate-950">
      <section className="mx-auto max-w-3xl rounded-[28px] border border-purple-100 bg-white p-8 shadow-xl shadow-purple-100">
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5a1372]">Envision Chess Academy</div>
        <h1 className="mt-3 text-3xl font-black text-[#5a1372]">Terms and Conditions</h1>
        <p className="mt-4 leading-7 text-slate-700">
          This page is reserved for academy terms and conditions. Registration confirms that users agree to the platform rules,
          class conduct expectations, and academy communication policies.
        </p>
        <p className="mt-4 leading-7 text-slate-700">
          Replace this placeholder with the final terms when ready.
        </p>
        <Link href="/register" className="mt-6 inline-flex rounded-xl bg-[#5a1372] px-5 py-3 text-sm font-black text-white">
          Back to Registration
        </Link>
      </section>
    </main>
  );
}
