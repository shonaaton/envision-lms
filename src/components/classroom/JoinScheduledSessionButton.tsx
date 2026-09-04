"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";
import { isJoinWindowOpen } from "@/lib/classroomSessions";
import CreditGateModal, { type CreditGateKind } from "@/components/classroom/CreditGateModal";
import type { ClassroomCreditEligibility } from "@/lib/classroomCreditAccess";
import { getCachedClassroomEligibility, loadClassroomEligibility, resetJoinEligibilityCache } from "@/components/classroom/classroomCreditEligibilityClient";

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

/**
 * Credit eligibility is identical for every join button on a page, so all
 * instances share one in-flight request and one cached answer. It is fetched
 * eagerly on mount so the click handler can decide synchronously — that keeps
 * the real launch (window.open for Meet) inside the user's own click gesture
 * and out of reach of popup blockers.
 */
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
  const [eligibility, setEligibility] = useState<ClassroomCreditEligibility | null>(getCachedClassroomEligibility());
  const [gate, setGate] = useState<CreditGateKind | null>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!scheduledFor) return;
    const refresh = () => setJoinOpen(isJoinWindowOpen({ scheduledFor, startTime, durationMinutes }));
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [durationMinutes, scheduledFor, startTime]);

  useEffect(() => {
    let active = true;
    void loadClassroomEligibility().then((payload) => {
      if (active && payload) setEligibility(payload);
    });
    return () => {
      active = false;
    };
  }, []);

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

  /**
   * The one and only real classroom launch. Called either directly from the
   * button (normal balance) or from the warning modal's confirm button — both
   * are direct user gestures, so the Meet tab is never popup-blocked.
   */
  function launchClassroom() {
    if (launchedRef.current) return;
    launchedRef.current = true;
    const destination = `/classrooms/${classroomId}/live?session=${encodeURIComponent(sessionId)}`;
    if (typeof window !== "undefined") {
      const googleMeetUrl = normalizeGoogleMeetUrl(meetingUrl);
      if (googleMeetUrl) window.open(googleMeetUrl, "_blank", "noopener,noreferrer");
      // The balance may change as a result of this class; don't reuse the cache.
      resetJoinEligibilityCache();
      window.location.assign(destination);
    }
  }

  function handleClick() {
    if (effectiveDisabled) return;
    // Nothing external opens until eligibility says so.
    const current = eligibility || getCachedClassroomEligibility();
    if (current?.blocked) {
      setGate("blocked");
      return;
    }
    if (current?.requiresWarning) {
      setGate("final_class");
      return;
    }
    if (!current) {
      // Status hasn't arrived yet (rare — it is fetched on mount). Resolve it
      // before opening anything. If the lookup itself fails we fall through to
      // launching: the server-side gate in the classroom page is authoritative
      // and will still turn a blocked student away, so a transient network
      // error must not lock a paid-up student out of their class.
      void loadClassroomEligibility().then((payload) => {
        if (payload?.blocked) return setGate("blocked");
        if (payload?.requiresWarning) return setGate("final_class");
        setGate(null);
        launchClassroom();
      });
      return;
    }
    launchClassroom();
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={effectiveDisabled} className={effectiveClassName}>
        {icon}
        {effectiveLabel}
      </button>
      {gate ? <CreditGateModal kind={gate} onClose={() => setGate(null)} onConfirm={launchClassroom} /> : null}
    </>
  );
}
