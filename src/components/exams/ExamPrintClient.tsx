"use client";

import { useEffect, useState } from "react";
import ExamPrintSheet, { type PrintablePaper } from "./ExamPrintSheet";

/**
 * The printable paper on a bare page (no portal shell, so nothing clips a multi-page print).
 * The toolbar is screen-only; the API call keeps the admin Exams permission check.
 */
export default function ExamPrintClient({ tier, level, answers }: { tier: string; level: number; answers: boolean }) {
  const [paper, setPaper] = useState<PrintablePaper | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/exams?view=paper&tier=${encodeURIComponent(tier)}&level=${level}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load the paper.");
        if (!data.paper) throw new Error("This level has no paper yet.");
        setPaper(data.paper);
        // The browser offers the title as the PDF's file name.
        document.title = `${data.paper.levelLabel} exam${answers ? " - answer key" : ""}`;
      })
      .catch((reason) => setError(reason.message));
  }, [tier, level, answers]);

  const href = (withAnswers: boolean) => `/admin/exams/print?tier=${encodeURIComponent(tier)}&level=${level}${withAnswers ? "&answers=1" : ""}`;

  return (
    <div className="exam-print-page">
      <style>{`
        .exam-print-page { min-height: 100vh; background: #e2e8f0; padding: 16px 0 8px; }
        .exam-print-bar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; margin: -16px 0 16px; padding: 10px; background: #fff; border-bottom: 1px solid #cbd5e1; font: 14px system-ui, sans-serif; }
        .exam-print-bar a, .exam-print-bar button { padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font-weight: 700; text-decoration: none; cursor: pointer; }
        .exam-print-bar .on { background: #5a1372; border-color: #5a1372; color: #fff; }
        .exam-print-bar .hint { color: #64748b; font-size: 12px; }
        .exam-print-msg { text-align: center; font: 14px system-ui, sans-serif; color: #475569; padding: 40px; }
        @media print { .exam-print-page { background: none; padding: 0; min-height: 0; } .exam-print-bar { display: none; } body > *:not(.exam-print-page):not(:has(.exam-print-page)) { display: none !important; } }
      `}</style>
      <div className="exam-print-bar">
        <a href="/admin/exams">← Back to Exams</a>
        <a href={href(false)} className={answers ? "" : "on"}>
          Student copy
        </a>
        <a href={href(true)} className={answers ? "on" : ""}>
          Answer key
        </a>
        <button type="button" onClick={() => window.print()} disabled={!paper}>
          Print / Save as PDF
        </button>
        <span className="hint">Paper size A4 · Margins: Default · Scale 100%</span>
      </div>
      {error ? <div className="exam-print-msg">{error}</div> : paper ? <ExamPrintSheet paper={paper} answers={answers} /> : <div className="exam-print-msg">Loading the paper...</div>}
    </div>
  );
}
