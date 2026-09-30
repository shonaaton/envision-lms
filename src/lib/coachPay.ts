import { academyMonthOf, monthBounds, monthLabel, shiftMonth } from "@/lib/feedback/feedbackCycleDates";
import { effectiveSessionCoachId, scheduledPaymentMinutes, scheduledStartDate } from "@/lib/teachingStats";
import { COACH_RATE_SCOPES, type CoachRateScope, type PayKind, type PayPlanType, type RateUnit } from "@/models/CoachPay";

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

export type RateSource = CoachRateScope | "session_override" | "pay_plan" | "monthly";

export const RATE_SCOPE_LABELS: Record<RateSource, string> = {
  session_override: "This class only",
  pay_plan: "Coach's pay plan",
  monthly: "Fixed monthly pay",
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
  source: CoachRateScope | "session_override" | "pay_plan";
  kind: PayKind;
  rateId: string;
};

/** A class kind, or the fixed amount of a monthly-paid coach. */
export type PayEventKind = PayKind | "monthly";

export type PayEvent = {
  id: string;
  date: Date;
  coachId: string;
  coachName: string;
  classroomId: string;
  classroomTitle: string;
  isDemoClass: boolean;
  /** A demo whose student has since enrolled - invoiced on its own line. */
  demoConverted: boolean;
  batchName: string;
  /** The classroom's course level ("Intermediate"), so a batch that moved up a level reads clearly. */
  level: string;
  sessionId: string;
  sessionNumber: number;
  topicName: string;
  sessionStatus: string;
  kind: PayEventKind;
  status: PayEventStatus;
  /** How this coach was paid when the class happened. */
  planType: PayPlanType;
  /** A class of a monthly-paid coach: counted, but paid through the monthly line. */
  coveredByMonthly: boolean;
  minutes: number;
  unit: RateUnit;
  rateAmount: number;
  /** Paise actually owed. Zero unless `status` is "payable". */
  amount: number;
  /** Paise this line is worth if it becomes payable. Equals `amount` when it already is. */
  exposure: number;
  rateSource: RateSource | "none";
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

/** "semi_pro" -> "Semi Pro". */
export function levelName(value: unknown) {
  const text = String(value || "").replace(/[_-]+/g, " ").trim();
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
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

/** The pay plan in force for a coach on a date, or null (paid from the rate cards alone). */
export function planFor(plans: any[], coachId: string, date: Date) {
  let best: any = null;
  for (const plan of plans) {
    if (idOf(plan.coach) !== coachId) continue;
    if (new Date(plan.effectiveFrom) > date) continue;
    if (!best || new Date(plan.effectiveFrom) > new Date(best.effectiveFrom)) best = plan;
  }
  return best;
}

function planAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function fromPlan(amount: number | null, unit: RateUnit, kind: PayKind): ResolvedRate | null {
  return amount === null ? null : { amount, unit, source: "pay_plan", kind, rateId: "" };
}

/**
 * The price of one class under the coach's plan - and only from what the admin
 * set for that coach, so what the Set Pay screen shows is exactly what is paid:
 *
 * - per hour:  regular and substitution classes at the hourly rate; demos and
 *              conversions at the plan's amounts;
 * - per class: regular classes at the batch rate set for this coach (the
 *              coach's batch grid); demos, substitutions and conversions at the
 *              plan's amounts.
 *
 * Nothing falls back to academy-, batch- or classroom-wide cards: an amount the
 * plan leaves empty is "no rate set", which holds the invoice until an admin
 * sets it. A coach with no plan at all is still priced the old way, from the
 * rate cards, until they are given one.
 */
export function priceWithPlan(plan: any, input: RateLookupInput): ResolvedRate | null {
  if (!plan) return resolveRate(input);
  const type: PayPlanType = plan.type || "per_class";
  if (type === "per_hour" && (input.kind === "regular" || input.kind === "substitute")) {
    return fromPlan(planAmount(plan.hourlyRate), "per_hour", input.kind);
  }
  if (input.kind === "demo") return fromPlan(planAmount(plan.demoRate), "per_class", "demo");
  if (input.kind === "substitute") return fromPlan(planAmount(plan.substituteRate), "per_class", "substitute");
  if (input.kind === "demoConversionBonus") return fromPlan(planAmount(plan.conversionBonus), "per_class", "demoConversionBonus");
  return coachBatchRate(input);
}

/**
 * A coach's regular-class rate for a batch on a date: the most recently started
 * rate set for this coach on the batch (it follows the batch through every
 * course it moves on to) or on this one classroom. Latest start date wins, so a
 * rate saved today replaces an older one whichever way the older one was set.
 */
export function coachBatchRate(input: Omit<RateLookupInput, "kind">): ResolvedRate | null {
  let best: { card: any; value: { amount: number; unit: RateUnit } } | null = null;
  for (const card of input.rates) {
    if (card.isActive === false) continue;
    if (idOf(card.coach) !== input.coachId) continue;
    const matches =
      (card.scope === "classroom_coach" && idOf(card.classroom) === input.classroomId) ||
      (card.scope === "batch_coach" && input.batchIds.includes(idOf(card.batch)));
    if (!matches) continue;
    if (new Date(card.effectiveFrom || 0) > input.date) continue;
    const value = rateValueFor(card, "regular");
    if (!value) continue;
    if (!best || new Date(card.effectiveFrom || 0) >= new Date(best.card.effectiveFrom || 0)) best = { card, value };
  }
  return best
    ? { amount: best.value.amount, unit: best.value.unit, source: best.card.scope, kind: "regular", rateId: idOf(best.card._id) }
    : null;
}

export type BuildPayEventsInput = {
  classrooms: any[];
  rates: any[];
  overrides: any[];
  rulings: any[];
  /** Demo booking id -> the moment that demo turned into an enrolment. */
  conversions: Map<string, { convertedAt: Date; studentName: string }>;
  range: { from: Date; to: Date };
  /** Coach pay plans (CoachPayPlan), with `coach` populated for names. */
  plans?: any[];
  /** Leave out monthly lines - for views filtered to one batch or classroom. */
  skipMonthly?: boolean;
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
  const plans = input.plans || [];
  const onlyCoach = input.coachId ? String(input.coachId) : "";
  const events: PayEvent[] = [];

  for (const classroom of classrooms) {
    if (classroom.isSessionInstance) continue;
    const classroomId = idOf(classroom._id);
    const isDemoClass = classroom.classroomType === "demo";
    const demoConverted = isDemoClass && conversions.has(idOf(classroom.demoBooking));
    const batchIds = (classroom.batches || []).map(idOf).filter(Boolean);
    const batchName = (classroom.batches || []).map((batch: any) => batch?.name).filter(Boolean).join(", ");
    const level = levelName(classroom.level);
    const classroomCoach = classroom.coach || classroom.instructor;
    const sessions = Array.isArray(classroom.generatedSessions) ? classroom.generatedSessions : [];

    let demoTaughtBy: { coachId: string; coachName: string; minutes: number } | null = null;

    for (const session of sessions) {
      const sessionId = idOf(session._id);
      const date = scheduledStartDate(session, classroom);
      const coachId = effectiveSessionCoachId(session, classroom);
      if (!coachId) continue;
      const coachSource = [session.conductedBy, session.substituteCoach, session.assignedCoach, classroom.coach, classroom.instructor].find(
        (candidate: any) => idOf(candidate) === coachId
      );
      const coachName = nameOf(coachSource, "Coach");
      const status = String(session.status || "");
      // Whoever held the classroom on the day - frozen on the class by a
      // permanent coach change - not whoever holds it now.
      const assignedCoach = session.assignedCoach || classroomCoach;
      const assignedCoachId = idOf(assignedCoach);
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
      const plan = planFor(plans, coachId, date);
      const planType: PayPlanType = plan?.type || "per_class";

      // A monthly-paid coach's classes are counted (hours, attendance) but earn
      // nothing on their own: the month's fixed amount covers them.
      if (planType === "monthly") {
        if (!isPayableStatus) continue;
        events.push({
          id: `${classroomId}:${sessionId}:${coachId}`,
          date,
          coachId,
          coachName,
          classroomId,
          classroomTitle: classroom.title || "Classroom",
          isDemoClass,
          demoConverted,
          batchName: batchName || (isDemoClass ? "Demo" : "Unassigned"),
          level,
          sessionId,
          sessionNumber: Number(session.sessionNumber || 0),
          topicName: session.topicName || "",
          sessionStatus: status,
          kind,
          status: "payable",
          planType,
          coveredByMonthly: true,
          minutes,
          unit: "per_class",
          rateAmount: 0,
          amount: 0,
          exposure: 0,
          rateSource: "monthly",
          isSubstitution,
          substitutedForName: isSubstitution ? nameOf(assignedCoach, "") : "",
          studentCount: (classroom.students || []).length,
          note: "",
        });
        continue;
      }

      const override = overrideFor(overrides, classroomId, sessionId, coachId);
      const resolved: ResolvedRate | null = override
        ? {
            amount: Number(override.amount || 0),
            unit: (override.unit as RateUnit) || "per_class",
            source: "session_override",
            kind: (override.kind as PayKind) || kind,
            rateId: idOf(override._id),
          }
        : priceWithPlan(plan, { kind, coachId, classroomId, batchIds, date, rates });

      const exposure = resolved ? amountForRate(resolved, minutes) : 0;
      const ruling = isReviewable ? rulingFor(rulings, classroomId, sessionId) : null;
      // The ruling decides first: a class ruled unpaid is unpaid whether or not
      // it has a rate, and one still awaiting a ruling is waiting either way.
      // Only a class that is actually payable can be missing a rate.
      const eventStatus: PayEventStatus = isReviewable
        ? !ruling
          ? "pending_review"
          : !ruling.payCoach
            ? "declined"
            : resolved
              ? "payable"
              : "unpriced"
        : resolved
          ? "payable"
          : "unpriced";

      events.push({
        id: `${classroomId}:${sessionId}:${coachId}`,
        date,
        coachId,
        coachName,
        classroomId,
        classroomTitle: classroom.title || "Classroom",
        isDemoClass,
        demoConverted,
        batchName: batchName || (isDemoClass ? "Demo" : "Unassigned"),
        level,
        sessionId,
        sessionNumber: Number(session.sessionNumber || 0),
        topicName: session.topicName || "",
        sessionStatus: status,
        kind,
        status: eventStatus,
        planType,
        coveredByMonthly: false,
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

    const bonusPlan = planFor(plans, demoTaughtBy.coachId, convertedAt);
    // A monthly amount covers everything, conversions included.
    if (bonusPlan?.type === "monthly") continue;
    const bonusRate = priceWithPlan(bonusPlan, {
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
      demoConverted: true,
      batchName: "Demo conversion",
      level: "",
      sessionId: "",
      sessionNumber: 0,
      topicName: conversion.studentName ? `${conversion.studentName} enrolled` : "Demo converted",
      sessionStatus: "converted",
      kind: "demoConversionBonus",
      status: "payable",
      planType: bonusPlan?.type || "per_class",
      coveredByMonthly: false,
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

  if (!input.skipMonthly) events.push(...monthlyPayEvents(plans, range, onlyCoach));

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

const MAX_MONTHS = 240;

/**
 * One line per month for each coach on a fixed monthly plan, dated on the
 * month's last day. The plan in force on that day decides the month. A plan
 * with no amount yet is "unpriced", which blocks that coach's invoice until an
 * admin fills it in.
 */
export function monthlyPayEvents(plans: any[], range: { from: Date; to: Date }, onlyCoach = "", now = new Date()): PayEvent[] {
  const monthlyCoaches = Array.from(new Set(plans.filter((plan) => plan.type === "monthly").map((plan) => idOf(plan.coach)))).filter(
    (coachId) => !onlyCoach || coachId === onlyCoach
  );
  if (!monthlyCoaches.length) return [];

  const earliest = plans.reduce((min, plan) => Math.min(min, new Date(plan.effectiveFrom).getTime()), Infinity);
  const from = new Date(Math.max(range.from.getTime(), earliest));
  const to = new Date(Math.min(range.to.getTime(), monthBounds(academyMonthOf(now)).end.getTime()));
  if (!(from <= to)) return [];

  const events: PayEvent[] = [];
  let month = academyMonthOf(from);
  for (let guard = 0; guard < MAX_MONTHS; guard += 1, month = shiftMonth(month, 1)) {
    const { start, end } = monthBounds(month);
    if (start > to) break;
    if (end < range.from || end > range.to) continue;
    for (const coachId of monthlyCoaches) {
      const plan = planFor(plans, coachId, end);
      if (plan?.type !== "monthly") continue;
      const amount = planAmount(plan.monthlyAmount);
      events.push({
        id: `monthly:${coachId}:${month}`,
        date: end,
        coachId,
        coachName: nameOf(plan.coach, "Coach"),
        classroomId: "",
        classroomTitle: `Fixed monthly pay - ${monthLabel(month)}`,
        isDemoClass: false,
        demoConverted: false,
        batchName: "",
        level: "",
        sessionId: "",
        sessionNumber: 0,
        topicName: "",
        sessionStatus: "",
        kind: "monthly",
        status: amount === null ? "unpriced" : "payable",
        planType: "monthly",
        coveredByMonthly: false,
        minutes: 0,
        unit: "per_class",
        rateAmount: amount || 0,
        amount: amount || 0,
        exposure: amount || 0,
        rateSource: "monthly",
        isSubstitution: false,
        substitutedForName: "",
        studentCount: 0,
        note: plan.note || "",
      });
    }
  }
  return events;
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
  monthlyAmount: number;
  pendingAmount: number;
  totalAmount: number;
  minutes: number;
};

export type CoachPaySummary = {
  rows: CoachPaySummaryRow[];
  totalAmount: number;
  pendingAmount: number;
  payableClasses: number;
  /** Payable demo classes, included in payableClasses. */
  demoClasses: number;
  pendingReview: number;
  unpriced: number;
  coachCount: number;
  regularAmount: number;
  demoAmount: number;
  substitutionAmount: number;
  bonusAmount: number;
  monthlyAmount: number;
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
      monthlyAmount: 0,
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
      row.minutes += event.kind === "demoConversionBonus" || event.kind === "monthly" ? 0 : event.minutes;
      if (event.kind === "monthly") {
        row.monthlyAmount += event.amount;
      } else if (event.kind === "regular") {
        row.regularClasses += 1;
        row.regularAmount += event.amount;
      } else if (event.kind === "demo" || (event.kind === "substitute" && event.isDemoClass)) {
        // A demo a substitute taught is still a demo, not a substitution class.
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
    payableClasses: events.filter((event) => event.status === "payable" && event.kind !== "demoConversionBonus" && event.kind !== "monthly").length,
    demoClasses: rows.reduce((sum, row) => sum + row.demoClasses, 0),
    pendingReview: events.filter((event) => event.status === "pending_review").length,
    unpriced: events.filter((event) => event.status === "unpriced").length,
    coachCount: rows.length,
    regularAmount: rows.reduce((sum, row) => sum + row.regularAmount, 0),
    demoAmount: rows.reduce((sum, row) => sum + row.demoAmount, 0),
    substitutionAmount: rows.reduce((sum, row) => sum + row.substitutionAmount, 0),
    bonusAmount: rows.reduce((sum, row) => sum + row.bonusAmount, 0),
    monthlyAmount: rows.reduce((sum, row) => sum + row.monthlyAmount, 0),
  };
}

export const PAY_KIND_LABELS: Record<PayEventKind, string> = {
  monthly: "Fixed monthly pay",
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

export { formatHours } from "@/lib/hours";

export const PAY_PLAN_LABELS: Record<PayPlanType, string> = {
  per_class: "Per class",
  per_hour: "Per hour",
  monthly: "Fixed monthly",
};

export function isValidRateScope(value: unknown): value is CoachRateScope {
  return typeof value === "string" && (COACH_RATE_SCOPES as readonly string[]).includes(value);
}
