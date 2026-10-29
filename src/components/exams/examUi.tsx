"use client";

import { Chess } from "chess.js";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { STRONG_TOPIC_PERCENT, WEAK_TOPIC_PERCENT, type TopicBreakdown } from "@/lib/exams/examReport";
import { SUBMIT_REASON_LABELS, type SubmitReason } from "@/lib/exams/examRules";
import { cn } from "@/lib/utils";

export function istDateTime(value?: string | Date | null) {
  if (!value) return "-";
  return `${formatAcademyDateTime(value, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} IST`;
}

const statusStyle: Record<string, string> = {
  assigned: "bg-brand/10 text-brand",
  in_progress: "bg-amber-50 text-amber-700",
  submitted: "bg-emerald-50 text-emerald-700",
  expired: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-50 text-red-700",
};

const statusLabel: Record<string, string> = {
  assigned: "Not started",
  in_progress: "In progress",
  submitted: "Completed",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function ExamStatusBadge({ status }: { status: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", statusStyle[status] || "bg-slate-100 text-slate-600")}>{statusLabel[status] || status}</span>;
}

/** Why the exam ended. Anything but the student's own submit is flagged for staff. */
export function SubmitReasonBadge({ reason }: { reason?: string | null }) {
  if (!reason) return null;
  const forced = reason !== "completed";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", forced ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
      {SUBMIT_REASON_LABELS[reason as SubmitReason] || reason}
    </span>
  );
}

const certificateLabel: Record<string, string> = {
  none: "-",
  pending: "Being prepared",
  sent: "Requested",
  failed: "Request failed",
  issued: "Issued",
};

export function CertificateBadge({ status }: { status?: string }) {
  const value = status || "none";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", value === "issued" ? "bg-emerald-50 text-emerald-700" : value === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
      {certificateLabel[value] || value}
    </span>
  );
}

export function boardFen(fen?: string) {
  if (!fen) return "";
  try {
    return new Chess(fen).fen();
  } catch {
    return fen;
  }
}

/** A position to look at, not to play. */
export function FenDiagram({ fen, orientation = "white", size = 260 }: { fen: string; orientation?: "white" | "black"; size?: number }) {
  const value = boardFen(fen);
  if (!value) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="mx-auto w-full" style={{ maxWidth: size + 18 }}>
        <AssignmentChessboard
          maxWidth={size}
          position={value}
          boardOrientation={orientation}
          arePiecesDraggable={false}
          customDarkSquareStyle={{ backgroundColor: "#b58863" }}
          customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
        />
      </div>
    </div>
  );
}

/** Marks by topic, strongest first, with the strengths and weak spots called out. Never shows an answer. */
export function TopicBreakdownList({ breakdown }: { breakdown: TopicBreakdown }) {
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {breakdown.topics.map((score) => (
          <li key={score.topic} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-semibold text-slate-800">{score.topic}</span>
              <span className="shrink-0 text-slate-600">
                {score.earned}/{score.max} · {score.percent}%
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", score.percent >= STRONG_TOPIC_PERCENT ? "bg-emerald-500" : score.percent < WEAK_TOPIC_PERCENT ? "bg-red-400" : "bg-amber-400")}
                style={{ width: `${score.percent}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {breakdown.strong.length > 0 && <div className="text-xs text-emerald-700"><b>Strong in:</b> {breakdown.strong.join(", ")}</div>}
      {breakdown.weak.length > 0 && <div className="text-xs text-red-700"><b>Needs more work:</b> {breakdown.weak.join(", ")}</div>}
    </div>
  );
}

export type StaffRow = {
  id: string;
  student: { id: string; name: string; username: string };
  levelLabel: string;
  tier: string;
  levelNumber: number;
  paperVersion: number;
  source: "manual" | "auto_completion";
  classroom: { id: string; title: string } | null;
  assignedAt: string;
  availableUntil: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  submitReason: string | null;
  violations: { type: string; at: string }[];
  score: { mcq: number; positions: number; total: number; max: number; percent?: number } | null;
  mcqCorrect: number;
  mcqAnswered: number;
  positionsSolved: number;
  wrongMoves: number;
  hintsUsed: number;
  topics: TopicBreakdown | null;
  certificate: { status: string; url: string; lastError: string; attempts: number; number: string };
};

const violationLabel: Record<string, string> = {
  tab_hidden: "Left the exam tab (another tab or app)",
  page_reopened: "Reloaded or reopened the exam",
  app_closed: "Closed the app or browser",
};

export function ViolationTimeline({ violations }: { violations: { type: string; at: string }[] }) {
  if (!violations.length) return <div className="text-xs text-slate-500">Never left the exam.</div>;
  return (
    <ol className="space-y-1">
      {violations.map((violation, index) => (
        <li key={`${violation.at}-${index}`} className="text-xs text-slate-700">
          <span className="font-bold">{index === 0 && violation.type !== "app_closed" ? "Warning" : "Ended"}</span> · {violationLabel[violation.type] || violation.type} · {istDateTime(violation.at)}
        </li>
      ))}
    </ol>
  );
}

/** The read-only results table shared by coaches (their students) and staff. */
export function ExamResultsTable({ rows, actions }: { rows: StaffRow[]; actions?: (row: StaffRow) => React.ReactNode }) {
  if (!rows.length) return <div className="p-8 text-center text-sm text-slate-500">No exams yet.</div>;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <details key={row.id} className="group p-3 sm:p-4">
          <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black text-slate-950">{row.student.name || row.student.username}</span>
                <span className="text-xs font-semibold text-brand">{row.levelLabel}</span>
                <ExamStatusBadge status={row.status} />
                <SubmitReasonBadge reason={row.submitReason} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {row.source === "auto_completion" ? `Auto · ${row.classroom?.title || "course completed"}` : "Assigned by admin"} · open until {istDateTime(row.availableUntil)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {row.score && <span className="text-lg font-black text-slate-950">{row.score.total}<span className="text-xs text-slate-500">/{row.score.max}</span></span>}
              {row.status === "submitted" && <CertificateBadge status={row.certificate.status} />}
            </div>
          </summary>
          <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <div><b>Started:</b> {istDateTime(row.startedAt)}</div>
              <div><b>Submitted:</b> {istDateTime(row.submittedAt)}</div>
              {row.score && (
                <div>
                  <b>MCQs:</b> {row.score.mcq}/20 ({row.mcqCorrect} of {row.mcqAnswered} answered right) · <b>Positions:</b> {row.score.positions}/80 ({row.positionsSolved} solved, {row.wrongMoves} wrong moves, {row.hintsUsed} hints)
                </div>
              )}
              {row.certificate.number && <div><b>Certificate no.:</b> {row.certificate.number}</div>}
              {row.certificate.url && (
                <a href={row.certificate.url} target="_blank" rel="noreferrer" className="font-bold text-brand underline">
                  Open certificate
                </a>
              )}
              {row.certificate.lastError && row.certificate.status !== "issued" && <div className="text-xs text-red-700">Certificate: {row.certificate.lastError}</div>}
              {row.topics && row.topics.topics.length > 0 && (
                <div className="pt-2">
                  <div className="mb-1 font-bold">By topic</div>
                  <TopicBreakdownList breakdown={row.topics} />
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 font-bold">Leaving the exam</div>
              <ViolationTimeline violations={row.violations} />
              {actions && <div className="mt-3 flex flex-wrap gap-2">{actions(row)}</div>}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
