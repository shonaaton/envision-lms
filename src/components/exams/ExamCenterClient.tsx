"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, ClipboardCheck, Clock, Download, Loader2 } from "lucide-react";
import { EXAM_DURATION_MINUTES, EXAM_MAX_SCORE } from "@/lib/exams/examRules";
import { CertificateBadge, ExamResultsTable, ExamStatusBadge, SubmitReasonBadge, istDateTime, type StaffRow } from "./examUi";

type StudentExam = {
  id: string;
  levelLabel: string;
  status: string;
  assignedAt: string;
  availableUntil: string;
  startedAt: string | null;
  endsAt: string | null;
  submittedAt: string | null;
  submitReason: string | null;
  score: { mcq: number; positions: number; total: number; max: number } | null;
  certificate: { status: string; url: string; number: string } | null;
};

export default function ExamCenterClient({ role }: { role: string }) {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<StudentExam[]>([]);
  const [results, setResults] = useState<StaffRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/exams", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load exams.");
        if (!alive) return;
        setExams(data.exams || []);
        setResults(data.results || []);
      })
      .catch((reason) => alive && setError(reason.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const student = role === "student";
  const open = exams.filter((exam) => exam.status === "assigned" || exam.status === "in_progress");
  const done = exams.filter((exam) => exam.status !== "assigned" && exam.status !== "in_progress");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-brand/10 p-2.5 text-brand">
          <ClipboardCheck size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-950">Exam Center</h1>
          <p className="text-sm text-slate-600">
            {student
              ? `Level exams: ${EXAM_MAX_SCORE} marks, ${EXAM_DURATION_MINUTES} minutes, and a certificate when you complete one.`
              : role === "instructor"
                ? "Exam results for the students you teach."
                : "Every exam sitting. Papers and assigning are on the admin Exams page."}
          </p>
        </div>
        {!student && role !== "instructor" && (
          <Link href="/admin/exams" className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-brand hover:bg-brand/5">
            Manage exams
          </Link>
        )}
      </header>

      {loading && (
        <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading exams...
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {!loading && student && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Waiting for you</h2>
            {!open.length && <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No exam is waiting for you right now.</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              {open.map((exam) => (
                <article key={exam.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-black text-slate-950">{exam.levelLabel}</span>
                    <ExamStatusBadge status={exam.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                    <Clock size={14} /> Open until {istDateTime(exam.availableUntil)}
                  </div>
                  <Link href={`/exams/${exam.id}`} className="btn btn-primary mt-3 inline-flex w-full justify-center">
                    {exam.status === "in_progress" ? "Back to the exam" : "Open exam"}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Completed and past</h2>
            {!done.length && <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Nothing here yet.</div>}
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {done.map((exam) => (
                <div key={exam.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-950">{exam.levelLabel}</span>
                      <ExamStatusBadge status={exam.status} />
                      {exam.submitReason && exam.submitReason !== "completed" && <SubmitReasonBadge reason={exam.submitReason} />}
                    </div>
                    <div className="text-xs text-slate-500">
                      {exam.status === "submitted" ? `Completed ${istDateTime(exam.submittedAt)}` : `Closed ${istDateTime(exam.availableUntil)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {exam.score && (
                      <Link href={`/exams/${exam.id}`} className="text-lg font-black text-slate-950 hover:text-brand">
                        {exam.score.total}
                        <span className="text-xs text-slate-500">/{exam.score.max}</span>
                      </Link>
                    )}
                    {exam.certificate?.url ? (
                      <a href={exam.certificate.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-black text-brand">
                        <Download size={14} /> Certificate
                      </a>
                    ) : exam.certificate ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Award size={14} /> <CertificateBadge status={exam.certificate.status} />
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {!loading && !student && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <ExamResultsTable rows={results} />
        </section>
      )}
    </div>
  );
}
