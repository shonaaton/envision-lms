"use client";

import { useEffect, useState } from "react";
import { Video } from "lucide-react";

/** Owners may open the room a little before the student, and stay while a class overruns. */
const OPENS_BEFORE_MS = 10 * 60 * 1000;
const CLOSES_AFTER_MS = 60 * 60 * 1000;

/**
 * Google Meet only - a salesperson sits in on the call, never on the classroom
 * board, so this is a plain link rather than the classroom join flow.
 */
export function LeadMeetJoinButton({ meetingUrl, startAt, endAt }: { meetingUrl: string; startAt: string; endAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const opensAt = new Date(startAt).getTime() - OPENS_BEFORE_MS;
  const closesAt = new Date(endAt).getTime() + CLOSES_AFTER_MS;
  const disabled = "inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400";

  if (!meetingUrl) return <span className={disabled}><Video size={14} aria-hidden="true" />Meet link not added yet</span>;
  if (now > closesAt) return <span className={disabled}><Video size={14} aria-hidden="true" />Demo ended</span>;
  if (now < opensAt) return <span className={disabled} title="The Meet link opens 10 minutes before the demo."><Video size={14} aria-hidden="true" />Opens 10 min before</span>;

  return (
    <a
      href={meetingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-800"
    >
      <Video size={14} aria-hidden="true" />
      Join Google Meet
    </a>
  );
}
