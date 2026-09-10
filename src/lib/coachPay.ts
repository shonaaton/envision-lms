import { effectiveSessionCoachId, scheduledPaymentMinutes, scheduledStartDate } from "@/lib/teachingStats";
import { COACH_RATE_SCOPES, type CoachRateScope, type PayKind, type RateUnit } from "@/models/CoachPay";

/**
 * Turning a term's teaching into a payroll bill.
 *
 * The unit of payment is one class taught by one coach. Everything else - who
 * substituted for whom, whether a demo later converted, whether a no-show is
 * the coach's problem - only changes which rate applies to that class or
 * whether it is payable at all.
 *
 * The price of a class comes from a ladder of rate cards, most specific first,
 * so an academy can set one default and then override it for a coach, a batch,
 * a classroom, a coach-in-a-classroom, or a single class. Every line records
 * which rung priced it, so an admin can see a number and know where it came
 * from - and see "Not priced" rather than a silent zero when no rung applies.
 */

/** Most specific first. A rung only wins if it actually names an amount. */
export const RATE_LADDER: CoachRateScope[] = [
  "classroom_coach",
  "classroom",
  "batch_coach",
  "batch",
  "coach",
  "academy",
];

export const RATE_SCOPE_LABELS: Record<CoachRateScope | "session_override", string> = {
  session_override: "This class only",
  classroom_coach: "Coach in this classroom",
  classroom: "Classroom default",
  batch_coach: "Coach in this batch",
  batch: "Batch default",
  coach: "Coach default",
  academy: "Academy default",
};

/**
 * If a card does not price the kind we are asking about, what does it mean
 * instead. Walked kind by kind, and each kind is looked for down the WHOLE
 * ladder before the next kind is tried - an academy-wide substitution rate is a
 * deliberate statement about substitutions and must beat a classroom's ordinary
 * class rate standing in for one.
 */
const KIND_FALLBACKS: Record<PayKind, PayKind[]> = {
  regular: ["regular"],
  demo: ["demo", "regular"],
  substitute: ["substitute", "regular"],
  // A conversion bonus nobody configured is zero, not the price of a class.
  demoConversionBonus: ["demoConversionBonus"],
};

/** Classes a coach is paid for outright. */
export const PAYABLE_SESSION_STATUSES = ["completed"];

/**
 * Classes that did not happen through no fault of the coach. Not payable on
 * their own - an admin rules on each one, deciding independently whether the
 * coach is paid and whether the student is charged. Demos are excluded from
 * this entirely: a demo nobody attended costs the academy nothing.
 */
export const REVIEWABLE_SESSION_STATUSES = ["student_no_show", "technical_issue"];

export type PayEventStatus = "payable" | "pending_review" | "declined" | "unpriced";

export type ResolvedRate = {
  amount: number;
  unit: RateUnit;
  source: CoachRateScope | "session_override";
  kind: PayKind;
  rateId: string;
};

export type PayEvent = {
  id: string;
  date: Date;
  coachId: string;
  coachName: string;
  classroomId: string;
  classroomTitle: string;
  isDemoClass: boolean;
  batchName: string;
  sessionId: string;
  sessionNumber: number;
  topicName: string;
  sessionStatus: string;
  kind: PayKind;
  status: PayEventStatus;
  minutes: number;
  unit: RateUnit;
  rateAmount: number;
  /** Paise actually owed. Zero unless `status` is "payable". */
  amount: number;
  /** Paise this line is worth if it becomes payable. Equals `amount` when it already is. */
  exposure: number;
  rateSource: CoachRateScope | "session_override" | "none";
  isSubstitution: boolean;
  substitutedForName: string;
  studentCount: number;
  note: string;
};

export type RateLookupInput = {
  kind: PayKind;
  coachId: string;
  classroomId: string;
  batchIds: string[];
  date: Date;
  rates: any[];
};

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function nameOf(value: any, fallback = "") {
  return value?.name || value?.username || fallback;
}

function rateValueFor(card: any, kind: PayKind) {
  const value = card?.[kind];
  const amount = value?.amount;
  // `null`/`undefined` means the card is silent about this kind; 0 is a real
  // price meaning "unpaid", and must stop the search rather than fall through.
  if (amount === null || amount === undefined || amount === "") return null;
  const numeric = Number(amount);
  return Number.isFinite(numeric) && numeric >= 0
    ? { amount: numeric, unit: (value?.unit as RateUnit) || "per_class" }
    : null;
}

function scopeMatches(card: any, scope: CoachRateScope, input: RateLookupInput) {
  if (card.scope !== scope) return false;
  const cardCoach = idOf(card.coach);
  const cardClassroom = idOf(card.classroom);
  const cardBatch = idOf(card.batch);
  switch (scope) {
    case "classroom_coach":
      return cardClassroom === input.classroomId && cardCoach === input.coachId;
    case "classroom":
      return cardClassroom === input.classroomId;
    case "batch_coach":
      return !!cardBatch && input.batchIds.includes(cardBatch) && cardCoach === input.coachId;
    case "batch":
      return !!cardBatch && input.batchIds.includes(cardBatch);
    case "coach":
      return cardCoach === input.coachId;
    case "academy":
      return true;
    default:
      return false;
  }
}

/**
 * The card in force on `date` for one rung, or null.
 *
 * Cards are effective-dated so a raise never rewrites a month already paid:
 * the winner is the latest card that had already started by the class date.
 */
function cardForScope(scope: CoachRateScope, kind: PayKind, input: RateLookupInput) {
  let best: { card: any; value: { amount: number; unit: RateUnit } } | null = null;
  for (const card of input.rates) {
    if (card.isActive === false) continue;
    if (!scopeMatches(card, scope, input)) continue;
    if (new Date(card.effectiveFrom || 0) > input.date) continue;
    const value = rateValueFor(card, kind);
    if (!value) continue;
    if (!best || new Date(card.effectiveFrom || 0) > new Date(best.card.effectiveFrom || 0)) {
      best = { card, value };
    }
  }
  return best;
}

export function resolveRate(input: RateLookupInput): ResolvedRate | null {
  for (const kind of KIND_FALLBACKS[input.kind]) {
    for (const scope of RATE_LADDER) {
      const found = cardForScope(scope, kind, input);
      if (found) {
        return {
          amount: found.value.amount,
          unit: found.value.unit,
          source: scope,
          kind,
          rateId: idOf(found.card._id),
        };
      }
    }
  }
  return null;
}

/** Paise owed for one class at a rate. Hourly rates are pro-rated by class length. */
export function amountForRate(rate: { amount: number; unit: RateUnit }, minutes: number) {
  if (rate.unit === "per_hour") return Math.round((Number(rate.amount) * Math.max(0, minutes)) / 60);
  return Math.round(Number(rate.amount));
}

function overrideFor(overrides: any[], classroomId: string, sessionId: string, coachId: string) {
  return overrides.find(
    (item) =>
      idOf(item.classroom) === classroomId &&
      String(item.sessionId) === sessionId &&
      idOf(item.coach) === coachId
  );
}

function rulingFor(rulings: any[], classroomId: string, sessionId: string) {
  return rulings.find((item) => idOf(item.classroom) === classroomId && String(item.sessionId) === sessionId);
}

export type BuildPayEventsInput = {
  classrooms: any[];
  rates: any[];
  overrides: any[];
  rulings: any[];
  /** Demo booking id -> the moment that demo turned into an enrolment. */
  conversions: Map<string, { convertedAt: Date; studentName: string }>;
  range: { from: Date; to: Date };
  /** Limits the result to one coach - what an instructor is allowed to see. */
  coachId?: string;
};

function withinRange(date: Date, range: { from: Date; to: Date }) {
  return date >= range.from && date <= range.to;
}

/**
 * Every payable (and would-be payable) line in the window.
 *
 * Callers must not pass session-instance classrooms: those are mirrors of a
 * parent classroom's sessions, so including them bills every class twice.
 */
export function buildPayEvents(input: BuildPayEventsInput): PayEvent[] {
  const { classrooms, rates, overrides, rulings, conversions, range } = input;
  const onlyCoach = input.coachId ? String(input.coachId) : "";
  const events: PayEvent[] = [];

  for (const classroom of classrooms) {
    if (classroom.isSessionInstance) continue;
    const classroomId = idOf(classroom._id);
    const isDemoClass = classroom.classroomType === "demo";
    const batchIds = (classroom.batches || []).map(idOf).filter(Boolean);
    const batchName = (classroom.batches || []).map((batch: any) => batch?.name).filter(Boolean).join(", ");
    const assignedCoach = classroom.coach || classroom.instructor;
    const assignedCoachId = idOf(assignedCoach);
    const sessions = Array.isArray(classroom.generatedSessions) ? classroom.generatedSessions : [];

    let demoTaughtBy: { coachId: string; coachName: string; minutes: number } | null = null;

    for (const session of sessions) {
      const sessionId = idOf(session._id);
      const date = scheduledStartDate(session, classroom);
      const coachId = effectiveSessionCoachId(session, classroom);
      if (!coachId) continue;
      const coachSource = [session.conductedBy, session.substituteCoach, classroom.coach, classroom.instructor].find(
        (candidate: any) => idOf(candidate) === coachId
      );
      const coachName = nameOf(coachSource, "Coach");
      const status = String(session.status || "");
      const isSubstitution = Boolean(assignedCoachId) && coachId !== assignedCoachId;
      const minutes = scheduledPaymentMinutes(session, classroom);

      if (isDemoClass && status === "completed") {
        demoTaughtBy = { coachId, coachName, minutes };
      }

      if (onlyCoach && coachId !== onlyCoach) continue;
      if (!withinRange(date, range)) continue;

      const isPayableStatus = PAYABLE_SESSION_STATUSES.includes(status);
      // A demo that nobody attended costs nothing, so it never reaches review.
      const isReviewable = !isDemoClass && REVIEWABLE_SESSION_STATUSES.includes(status);
      if (!isPayableStatus && !isReviewable) continue;

      const kind: PayKind = isSubstitution ? "substitute" : isDemoClass ? "demo" : "regular";
      const override = overrideFor(overrides, classroomId, sessionId, coachId);
      const resolved: ResolvedRate | null = override
        ? {
            amount: Number(override.amount || 0),
            unit: (override.unit as RateUnit) || "per_class",
            source: "session_override",
            kind: (override.kind as PayKind) || kind,
            rateId: idOf(override._id),
          }
        : resolveRate({ kind, coachId, classroomId, batchIds, date, rates });

      const exposure = resolved ? amountForRate(resolved, minutes) : 0;
      const ruling = isReviewable ? rulingFor(rulings, classroomId, sessionId) : null;
      const eventStatus: PayEventStatus = !resolved
        ? "unpriced"
        : isPayableStatus
          ? "payable"
          : !ruling
            ? "pending_review"
            : ruling.payCoach
              ? "payable"
              : "declined";

      events.push({
        id: `${classroomId}:${sessionId}:${coachId}`,
        date,
        coachId,
        coachName,
        classroomId,
        classroomTitle: classroom.title || "Classroom",
        isDemoClass,
        batchName: batchName || (isDemoClass ? "Demo" : "Unassigned"),
        sessionId,
        sessionNumber: Number(session.sessionNumber || 0),
        topicName: session.topicName || "",
        sessionStatus: status,
        kind,
        status: eventStatus,
        minutes,
        unit: resolved?.unit || "per_class",
        rateAmount: resolved?.amount || 0,
        amount: eventStatus === "payable" ? exposure : 0,
        exposure,
        rateSource: resolved?.source || "none",
        isSubstitution,
        substitutedForName: isSubstitution ? nameOf(assignedCoach, "") : "",
        studentCount: (classroom.students || []).length,
        note: ruling?.note || override?.reason || "",
      });
    }

    // The conversion bonus is its own line dated at the conversion, not a
    // re-pricing of the demo. A month that has already been paid out must not
    // change value weeks later because a family finally said yes.
    if (!isDemoClass || !demoTaughtBy) continue;
    const conversion = conversions.get(idOf(classroom.demoBooking));
    if (!conversion) continue;
    const convertedAt = new Date(conversion.convertedAt);
    if (!withinRange(convertedAt, range)) continue;
    if (onlyCoach && demoTaughtBy.coachId !== onlyCoach) continue;

    const bonusRate = resolveRate({
      kind: "demoConversionBonus",
      coachId: demoTaughtBy.coachId,
      classroomId,
      batchIds,
      date: convertedAt,
      rates,
    });
    if (!bonusRate || bonusRate.amount <= 0) continue;
    const bonusAmount = amountForRate(bonusRate, demoTaughtBy.minutes);

    events.push({
      id: `${classroomId}:conversion:${demoTaughtBy.coachId}`,
      date: convertedAt,
      coachId: demoTaughtBy.coachId,
      coachName: demoTaughtBy.coachName,
      classroomId,
      classroomTitle: classroom.title || "Demo",
      isDemoClass: true,
      batchName: "Demo conversion",
      sessionId: "",
      sessionNumber: 0,
      topicName: conversion.studentName ? `${conversion.studentName} enrolled` : "Demo converted",
      sessionStatus: "converted",
      kind: "demoConversionBonus",
      status: "payable",
      minutes: demoTaughtBy.minutes,
      unit: bonusRate.unit,
      rateAmount: bonusRate.amount,
      amount: bonusAmount,
      exposure: bonusAmount,
      rateSource: bonusRate.source,
      isSubstitution: false,
      substitutedForName: "",
      studentCount: (classroom.students || []).length,
      note: "",
    });
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type CoachPaySummaryRow = {
  coachId: string;
  coachName: string;
  regularClasses: number;
  demoClasses: number;
  substitutionClasses: number;
  conversionBonuses: number;
  pendingReview: number;
  unpriced: number;
  regularAmount: number;
  demoAmount: number;
  substitutionAmount: number;
  bonusAmount: number;
  pendingAmount: number;
  totalAmount: number;
  minutes: number;
};

export type CoachPaySummary = {
  rows: CoachPaySummaryRow[];
  totalAmount: number;
  pendingAmount: number;
  payableClasses: number;
  pendingReview: number;
  unpriced: number;
  coachCount: number;
  regularAmount: number;
  demoAmount: number;
  substitutionAmount: number;
  bonusAmount: number;
};

export function summarizePayEvents(events: PayEvent[]): CoachPaySummary {
  const byCoach = new Map<string, CoachPaySummaryRow>();

  for (const event of events) {
    const row = byCoach.get(event.coachId) || {
      coachId: event.coachId,
      coachName: event.coachName,
      regularClasses: 0,
      demoClasses: 0,
      substitutionClasses: 0,
      conversionBonuses: 0,
      pendingReview: 0,
      unpriced: 0,
      regularAmount: 0,
      demoAmount: 0,
      substitutionAmount: 0,
      bonusAmount: 0,
      pendingAmount: 0,
      totalAmount: 0,
      minutes: 0,
    };

    if (event.status === "pending_review") {
      row.pendingReview += 1;
      row.pendingAmount += event.exposure;
    }
    if (event.status === "unpriced") row.unpriced += 1;

    if (event.status === "payable") {
      row.totalAmount += event.amount;
      row.minutes += event.kind === "demoConversionBonus" ? 0 : event.minutes;
      if (event.kind === "regular") {
        row.regularClasses += 1;
        row.regularAmount += event.amount;
      } else if (event.kind === "demo") {
        row.demoClasses += 1;
        row.demoAmount += event.amount;
      } else if (event.kind === "substitute") {
        row.substitutionClasses += 1;
        row.substitutionAmount += event.amount;
      } else {
        row.conversionBonuses += 1;
        row.bonusAmount += event.amount;
      }
    }

    byCoach.set(event.coachId, row);
  }

  const rows = Array.from(byCoach.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  return {
    rows,
    totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
    pendingAmount: rows.reduce((sum, row) => sum + row.pendingAmount, 0),
    payableClasses: events.filter((event) => event.status === "payable" && event.kind !== "demoConversionBonus").length,
    pendingReview: events.filter((event) => event.status === "pending_review").length,
    unpriced: events.filter((event) => event.status === "unpriced").length,
    coachCount: rows.length,
    regularAmount: rows.reduce((sum, row) => sum + row.regularAmount, 0),
    demoAmount: rows.reduce((sum, row) => sum + row.demoAmount, 0),
    substitutionAmount: rows.reduce((sum, row) => sum + row.substitutionAmount, 0),
    bonusAmount: rows.reduce((sum, row) => sum + row.bonusAmount, 0),
  };
}

export const PAY_KIND_LABELS: Record<PayKind, string> = {
  regular: "Regular class",
  demo: "Demo class",
  substitute: "Substitution",
  demoConversionBonus: "Demo conversion bonus",
};

export const PAY_STATUS_LABELS: Record<PayEventStatus, string> = {
  payable: "Payable",
  pending_review: "Awaiting ruling",
  declined: "Not paid",
  unpriced: "No rate set",
};

export function isValidRateScope(value: unknown): value is CoachRateScope {
  return typeof value === "string" && (COACH_RATE_SCOPES as readonly string[]).includes(value);
}
