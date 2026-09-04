"use client";

import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import CreditGateModal, { type CreditGateKind } from "@/components/classroom/CreditGateModal";
import { getCachedClassroomEligibility, loadClassroomEligibility, resetJoinEligibilityCache } from "@/components/classroom/classroomCreditEligibilityClient";
import type { ClassroomCreditEligibility } from "@/lib/classroomCreditAccess";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

/**
 * Shared guard for direct external Meet links. Unlike an LMS URL, Meet cannot
 * enforce our server-side classroom gate after navigation, so every exposed
 * first-party Meet action must decide before it launches the external tab.
 */
export default function CreditGatedGoogleMeetLink({ href, children, onClick, ...props }: Props) {
  const [eligibility, setEligibility] = useState<ClassroomCreditEligibility | null>(getCachedClassroomEligibility());
  const [gate, setGate] = useState<CreditGateKind | null>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadClassroomEligibility().then((payload) => {
      if (active && payload) setEligibility(payload);
    });
    return () => {
      active = false;
    };
  }, [href]);

  useEffect(() => {
    launchedRef.current = false;
    setGate(null);
  }, [href]);

  function launchGoogleMeet() {
    if (launchedRef.current) return;
    launchedRef.current = true;
    window.open(href, "_blank", "noopener,noreferrer");
    resetJoinEligibilityCache();
    setEligibility(null);
  }

  function requestGoogleMeet() {
    const current = eligibility || getCachedClassroomEligibility();
    if (current?.blocked) return setGate("blocked");
    if (current?.requiresWarning) return setGate("final_class");
    if (!current) {
      // Keep the established advisory fail-open policy for temporary client
      // lookup failures; the LMS classroom route remains server-authoritative.
      void loadClassroomEligibility().then((payload) => {
        if (payload?.blocked) return setGate("blocked");
        if (payload?.requiresWarning) return setGate("final_class");
        launchGoogleMeet();
      });
      return;
    }
    launchGoogleMeet();
  }

  return (
    <>
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          requestGoogleMeet();
        }}
      >
        {children}
      </a>
      {gate ? <CreditGateModal kind={gate} onClose={() => setGate(null)} onConfirm={launchGoogleMeet} confirmLabel="Join Classroom" /> : null}
    </>
  );
}
