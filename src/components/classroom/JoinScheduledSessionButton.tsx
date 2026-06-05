"use client";

import { useRouter } from "next/navigation";

type Props = {
  classroomId: string;
  sessionId: string;
  meetingUrl?: string;
  className?: string;
  label?: string;
};

export default function JoinScheduledSessionButton({
  classroomId,
  sessionId,
  meetingUrl,
  className = "btn-primary",
  label = "Join Classroom",
}: Props) {
  const router = useRouter();

  function handleClick() {
    if (meetingUrl && typeof window !== "undefined") {
      window.open(meetingUrl, "_blank", "noopener,noreferrer");
    }
    router.push(`/classrooms/${classroomId}?session=${sessionId}`);
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {label}
    </button>
  );
}
