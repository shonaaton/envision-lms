"use client";

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
  function handleClick() {
    if (disabled) return;
    const destination = `/classrooms/${classroomId}/live?session=${encodeURIComponent(sessionId)}`;
    if (typeof window !== "undefined") {
      window.location.assign(destination);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={disabled} className={className}>
      {label}
    </button>
  );
}
