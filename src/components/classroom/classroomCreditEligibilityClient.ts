"use client";

import type { ClassroomCreditEligibility } from "@/lib/classroomCreditAccess";

// All first-party classroom-entry surfaces share this one advisory result.
// The classroom route remains the authoritative enforcement point.
let eligibilityCache: ClassroomCreditEligibility | null = null;
let eligibilityRequest: Promise<ClassroomCreditEligibility | null> | null = null;

export function getCachedClassroomEligibility() {
  return eligibilityCache;
}

export function loadClassroomEligibility(): Promise<ClassroomCreditEligibility | null> {
  if (eligibilityCache) return Promise.resolve(eligibilityCache);
  if (!eligibilityRequest) {
    eligibilityRequest = fetch("/api/fees/credit-eligibility", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ClassroomCreditEligibility | null) => {
        if (payload) eligibilityCache = payload;
        return payload;
      })
      .catch(() => null)
      .finally(() => {
        eligibilityRequest = null;
      });
  }
  return eligibilityRequest;
}

/** Clears the shared cache after a class is joined so the next page load re-checks. */
export function resetJoinEligibilityCache() {
  eligibilityCache = null;
}
