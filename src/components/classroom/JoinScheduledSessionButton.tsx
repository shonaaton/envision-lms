"use client";

import { useRouter } from "next/navigation";

type Props = {
  classroomId: string;
  sessionId: string;
  meetingUrl?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
};

export default function JoinScheduledSessionButton({
  classroomId,
  sessionId,
  meetingUrl,
  className = "btn-primary",
  label = "Join Classroom",
  disabled = false,
}: Props) {
  const router = useRouter();

  function handleClick() {
    if (disabled) return;
    if (meetingUrl && typeof window !== "undefined") {
      window.open(meetingUrl, "_blank", "noopener,noreferrer");
    }
    router.push(`/classrooms/${classroomId}?session=${sessionId}`);
  }

  return (
    <button type="button" onClick={handleClick} disabled={disabled} className={className}>
      {label}
    </button>
  );
}
