"use client";

import type { ReactNode } from "react";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";

type Props = {
  classroomId: string;
  sessionId: string;
  meetingUrl?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
  icon?: ReactNode;
};

export default function JoinScheduledSessionButton({
  classroomId,
  sessionId,
  meetingUrl,
  className = "btn-primary",
  label = "Join Classroom",
  disabled = false,
  icon,
}: Props) {
  function handleClick() {
    if (disabled) return;
    const destination = `/classrooms/${classroomId}/live?session=${encodeURIComponent(sessionId)}`;
    if (typeof window !== "undefined") {
      const googleMeetUrl = normalizeGoogleMeetUrl(meetingUrl);
      if (googleMeetUrl) window.open(googleMeetUrl, "_blank", "noopener,noreferrer");
      window.location.assign(destination);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={disabled} className={className}>
      {icon}
      {label}
    </button>
  );
}
