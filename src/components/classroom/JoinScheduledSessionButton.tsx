"use client";

import { useEffect, useState, type ReactNode } from "react";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";
import { isJoinWindowOpen } from "@/lib/classroomSessions";

type Props = {
  classroomId: string;
  sessionId: string;
  meetingUrl?: string;
  className?: string;
  availableClassName?: string;
  unavailableClassName?: string;
  label?: string;
  availableLabel?: string;
  unavailableLabel?: string;
  disabled?: boolean;
  icon?: ReactNode;
  scheduledFor?: string | Date;
  startTime?: string;
  durationMinutes?: number;
};

export default function JoinScheduledSessionButton({
  classroomId,
  sessionId,
  meetingUrl,
  className = "btn-primary",
  availableClassName,
  unavailableClassName,
  label = "Join Classroom",
  availableLabel,
  unavailableLabel,
  disabled = false,
  icon,
  scheduledFor,
  startTime,
  durationMinutes,
}: Props) {
  const hasSchedule = Boolean(scheduledFor);
  const [joinOpen, setJoinOpen] = useState(() => {
    if (!scheduledFor) return true;
    return isJoinWindowOpen({ scheduledFor, startTime, durationMinutes });
  });

  useEffect(() => {
    if (!scheduledFor) return;
    const refresh = () => setJoinOpen(isJoinWindowOpen({ scheduledFor, startTime, durationMinutes }));
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [durationMinutes, scheduledFor, startTime]);

  const effectiveDisabled = disabled || (hasSchedule && !joinOpen);
  const effectiveClassName = hasSchedule
    ? joinOpen
      ? availableClassName || className
      : unavailableClassName || className
    : className;
  const effectiveLabel = hasSchedule
    ? joinOpen
      ? availableLabel || label
      : unavailableLabel || label
    : label;

  function handleClick() {
    if (effectiveDisabled) return;
    const destination = `/classrooms/${classroomId}/live?session=${encodeURIComponent(sessionId)}`;
    if (typeof window !== "undefined") {
      const googleMeetUrl = normalizeGoogleMeetUrl(meetingUrl);
      if (googleMeetUrl) window.open(googleMeetUrl, "_blank", "noopener,noreferrer");
      window.location.assign(destination);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={effectiveDisabled} className={effectiveClassName}>
      {icon}
      {effectiveLabel}
    </button>
  );
}
