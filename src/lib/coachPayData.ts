import "server-only";

import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Booking } from "@/models/Booking";
import { User } from "@/models/User";
import { CoachPayProposal, CoachRate, NoShowRuling, SessionPayOverride, type PayKind, type RateUnit } from "@/models/CoachPay";
import { buildPayEvents, resolveRate, summarizePayEvents, REVIEWABLE_SESSION_STATUSES, type ResolvedRate } from "@/lib/coachPay";
import { effectiveSessionCoachId, scheduledPaymentMinutes, scheduledStartDate } from "@/lib/teachingStats";
import type { PayPeriod } from "@/lib/payPeriods";

/**
 * Loading everything payroll needs in one place.
 *
 * The page and the export route must never disagree about what a month cost, so
 * both read through here rather than assembling their own queries.
 */

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

const BOUNDED = 8_640_000_000_000_00;

function isBounded(period: { from: Date; to: Date }) {
  return Math.abs(period.from.getTime()) < BOUNDED && Math.abs(period.to.getTime()) < BOUNDED;
}

/**
 * Which demos turned into enrolments, and when.
 *
 * Two sources have to agree: the booking's own stage, and the student record
 * that points back at the booking it came from. The student record carries the
 * date the academy actually enrolled them, so it wins when both exist.
 */
async function loadConversions(bookingIds: string[]) {
  const conversions = new Map<string, { convertedAt: Date; studentName: string }>();
  if (!bookingIds.length) return conversions;

  const [bookings, students] = await Promise.all([
    Booking.find({ _id: { $in: bookingIds } })
      .select("_id demoStatus updatedAt student")
      .populate("student", "name username")
      .lean(),
    User.find({ "conversionSetup.convertedFromBooking": { $in: bookingIds } })
      .select("name username conversionSetup.convertedFromBooking conversionSetup.convertedAt createdAt")
      .lean(),
  ]);

  for (const student of students as any[]) {
    const bookingId = idOf(student?.conversionSetup?.convertedFromBooking);
    if (!bookingId) continue;
    conversions.set(bookingId, {
      convertedAt: new Date(student?.conversionSetup?.convertedAt || student?.createdAt || Date.now()),
      studentName: student?.name || student?.username || "Student",
    });
  }

  for (const booking of bookings as any[]) {
    const bookingId = idOf(booking._id);
    if (booking.demoStatus !== "CONVERTED" || conversions.has(bookingId)) continue;
    conversions.set(bookingId, {
      convertedAt: new Date(booking.updatedAt || Date.now()),
      studentName: booking.student?.name || booking.student?.username || "Student",
    });
  }

  return conversions;
}

export type CoachPayFilters = {
  /** Restricts the whole report to one coach. Always set for an instructor. */
  coachId?: string;
  batchId?: string;
  classroomId?: string;
};

export async function loadCoachPay(period: PayPeriod, filters: CoachPayFilters = {}) {
  await dbConnect();

  const query: Record<string, any> = {
    isSessionInstance: { $ne: true },
    isTestClassroom: { $ne: true },
  };
  if (filters.classroomId) query._id = filters.classroomId;
  if (filters.batchId) query.batches = filters.batchId;
  if (filters.coachId) {
    query.$and = [
      {
        $or: [
          { coach: filters.coachId },
          { instructor: filters.coachId },
          { "generatedSessions.substituteCoach": filters.coachId },
          { "generatedSessions.conductedBy": filters.coachId },
        ],
      },
    ];
  }
  if (isBounded(period)) {
    // Demo classrooms are kept regardless of the window: a conversion bonus is
    // dated at the conversion, which can fall months after the demo was taught.
    const windowed = {
      $or: [
        { "generatedSessions.scheduledFor": { $gte: period.from, $lte: period.to } },
        { classroomType: "demo" },
      ],
    };
    query.$and = [...(query.$and || []), windowed];
  }

  const [classrooms, rates, overrides, rulings] = await Promise.all([
    Classroom.find(query)
      .select(
        "title classroomType demoBooking coach instructor batches students durationMinutes classDate startDate startTime generatedSessions isSessionInstance"
      )
      .populate("coach instructor", "name username")
      .populate("batches", "name")
      .populate("generatedSessions.substituteCoach generatedSessions.conductedBy", "name username")
      .lean(),
    CoachRate.find({ isActive: { $ne: false } }).lean(),
    SessionPayOverride.find({}).lean(),
    NoShowRuling.find({}).lean(),
  ]);

  const bookingIds = (classrooms as any[])
    .filter((classroom) => classroom.classroomType === "demo" && classroom.demoBooking)
    .map((classroom) => idOf(classroom.demoBooking));
  const conversions = await loadConversions(bookingIds);

  const events = buildPayEvents({
    classrooms: classrooms as any[],
    rates: rates as any[],
    overrides: overrides as any[],
    rulings: rulings as any[],
    conversions,
    range: { from: period.from, to: period.to },
    coachId: filters.coachId,
  });

  return {
    events,
    summary: summarizePayEvents(events),
    classrooms: classrooms as any[],
    overrides: overrides as any[],
  };
}

export type NoShowReviewItem = {
  classroomId: string;
  classroomTitle: string;
  batchName: string;
  sessionId: string;
  sessionNumber: number;
  topicName: string;
  sessionStatus: string;
  date: Date;
  minutes: number;
  coachId: string;
  coachName: string;
  students: Array<{ id: string; name: string }>;
  ruling: {
    payCoach: boolean;
    deductStudentCredit: boolean;
    note: string;
    decidedAt: Date | null;
    decidedByName: string;
  } | null;
};

/**
 * Classes waiting on - or already carrying - an admin's no-show ruling.
 *
 * Demo classrooms never appear: a demo the student skipped is not billed to
 * anyone, so there is nothing to decide.
 */
export async function loadNoShowReviews(period: PayPeriod, options: { includeDecided?: boolean } = {}) {
  await dbConnect();

  const query: Record<string, any> = {
    isSessionInstance: { $ne: true },
    isTestClassroom: { $ne: true },
    classroomType: { $ne: "demo" },
    "generatedSessions.status": { $in: REVIEWABLE_SESSION_STATUSES },
  };
  if (isBounded(period)) {
    query["generatedSessions.scheduledFor"] = { $gte: period.from, $lte: period.to };
  }

  const [classrooms, rulings] = await Promise.all([
    Classroom.find(query)
      .select("title classroomType coach instructor batches students durationMinutes classDate startDate startTime generatedSessions")
      .populate("coach instructor", "name username")
      .populate("batches", "name")
      .populate("students", "name username")
      .populate("generatedSessions.substituteCoach generatedSessions.conductedBy generatedSessions.students", "name username")
      .lean(),
    NoShowRuling.find({}).populate("decidedBy", "name username").lean(),
  ]);

  const items: NoShowReviewItem[] = [];
  for (const classroom of classrooms as any[]) {
    for (const session of classroom.generatedSessions || []) {
      if (!REVIEWABLE_SESSION_STATUSES.includes(String(session.status || ""))) continue;
      const date = scheduledStartDate(session, classroom);
      if (isBounded(period) && (date < period.from || date > period.to)) continue;

      const sessionId = idOf(session._id);
      const ruling = (rulings as any[]).find(
        (item) => idOf(item.classroom) === idOf(classroom._id) && String(item.sessionId) === sessionId
      );
      if (ruling && options.includeDecided === false) continue;

      const coachId = effectiveSessionCoachId(session, classroom);
      const coachSource = [session.conductedBy, session.substituteCoach, classroom.coach, classroom.instructor].find(
        (candidate: any) => idOf(candidate) === coachId
      );
      const roster = (session.students?.length ? session.students : classroom.students) || [];

      items.push({
        classroomId: idOf(classroom._id),
        classroomTitle: classroom.title || "Classroom",
        batchName: (classroom.batches || []).map((batch: any) => batch?.name).filter(Boolean).join(", ") || "Unassigned",
        sessionId,
        sessionNumber: Number(session.sessionNumber || 0),
        topicName: session.topicName || "",
        sessionStatus: String(session.status || ""),
        date,
        minutes: scheduledPaymentMinutes(session, classroom),
        coachId,
        coachName: coachSource?.name || coachSource?.username || "Coach",
        students: roster.map((student: any) => ({ id: idOf(student), name: student?.name || student?.username || "Student" })),
        ruling: ruling
          ? {
              payCoach: ruling.payCoach !== false,
              deductStudentCredit: Boolean(ruling.deductStudentCredit),
              note: ruling.note || "",
              decidedAt: ruling.decidedAt ? new Date(ruling.decidedAt) : null,
              decidedByName: ruling.decidedBy?.name || ruling.decidedBy?.username || "",
            }
          : null,
      });
    }
  }

  return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Everyone who could appear on a payroll: coaches, plus admins who teach. */
export async function listPayableCoaches() {
  await dbConnect();
  return User.find({ role: { $in: ["instructor", "admin", "sub-admin"] } })
    .select("name username role isActive")
    .sort({ name: 1 })
    .lean();
}


/** One classroom a coach is assigned to, with the rates that apply to them there. */
export type CoachAssignmentRow = {
  classroomId: string;
  classroomTitle: string;
  classroomType: string;
  batchName: string;
  batchIds: string[];
  isActive: boolean;
  /** The `classroom_coach` card for this exact pair, if one has been set. */
  card: {
    id: string;
    effectiveFrom: Date;
    values: Record<PayKind, { amount: number | null; unit: RateUnit }>;
  } | null;
  /** What each kind actually resolves to today, and which rung decided it. */
  effective: Record<PayKind, ResolvedRate | null>;
  pendingProposal: {
    id: string;
    values: Record<PayKind, { amount: number | null; unit: RateUnit }>;
    note: string;
    submittedAt: Date;
  } | null;
};

function cardValues(source: any): Record<PayKind, { amount: number | null; unit: RateUnit }> {
  const read = (kind: PayKind) => {
    const value = source?.[kind];
    const amount = value?.amount;
    return {
      amount: amount === null || amount === undefined ? null : Number(amount),
      unit: (value?.unit as RateUnit) || "per_class",
    };
  };
  return {
    regular: read("regular"),
    demo: read("demo"),
    demoConversionBonus: read("demoConversionBonus"),
    substitute: read("substitute"),
  };
}

/**
 * Every classroom a coach teaches, priced.
 *
 * This is the coach-by-coach view of the rate ladder: one row per classroom
 * they are assigned to, showing both the card set specifically for them there
 * and what the ladder currently resolves to, so it is obvious whether a number
 * was chosen for this coach or merely inherited from a default.
 */
export async function loadCoachAssignments(coachId: string, now = new Date()): Promise<CoachAssignmentRow[]> {
  await dbConnect();

  const [classrooms, rates, proposals] = await Promise.all([
    Classroom.find({
      isSessionInstance: { $ne: true },
      isTestClassroom: { $ne: true },
      $or: [{ coach: coachId }, { instructor: coachId }],
    })
      .select("title classroomType batches isActive")
      .populate("batches", "name")
      .sort({ isActive: -1, title: 1 })
      .lean(),
    CoachRate.find({ isActive: { $ne: false } }).lean(),
    CoachPayProposal.find({ coach: coachId, kind: "classroom_rate", status: "pending" }).lean(),
  ]);

  return (classrooms as any[]).map((classroom) => {
    const classroomId = idOf(classroom._id);
    const batchIds = (classroom.batches || []).map(idOf).filter(Boolean);

    // The card in force today for this exact coach-and-classroom pair.
    const own = (rates as any[])
      .filter(
        (rate) =>
          rate.scope === "classroom_coach" &&
          idOf(rate.classroom) === classroomId &&
          idOf(rate.coach) === coachId &&
          new Date(rate.effectiveFrom || 0) <= now
      )
      .sort((a, b) => new Date(b.effectiveFrom || 0).getTime() - new Date(a.effectiveFrom || 0).getTime())[0];

    const lookup = { coachId, classroomId, batchIds, date: now, rates: rates as any[] };
    const proposal = (proposals as any[]).find((item) => idOf(item.classroom) === classroomId);

    return {
      classroomId,
      classroomTitle: classroom.title || "Classroom",
      classroomType: classroom.classroomType || "series",
      batchName: (classroom.batches || []).map((batch: any) => batch?.name).filter(Boolean).join(", ") || "Unassigned",
      batchIds,
      isActive: classroom.isActive !== false,
      card: own
        ? { id: idOf(own._id), effectiveFrom: new Date(own.effectiveFrom || 0), values: cardValues(own) }
        : null,
      effective: {
        regular: resolveRate({ ...lookup, kind: "regular" }),
        demo: resolveRate({ ...lookup, kind: "demo" }),
        demoConversionBonus: resolveRate({ ...lookup, kind: "demoConversionBonus" }),
        substitute: resolveRate({ ...lookup, kind: "substitute" }),
      },
      pendingProposal: proposal
        ? {
            id: idOf(proposal._id),
            values: cardValues(proposal),
            note: proposal.note || "",
            submittedAt: new Date(proposal.submittedAt || proposal.createdAt || Date.now()),
          }
        : null,
    };
  });
}

export type ProposalRow = {
  id: string;
  kind: string;
  status: string;
  coachId: string;
  coachName: string;
  classroomId: string;
  classroomTitle: string;
  sessionId: string;
  sessionDate: Date | null;
  payKind: PayKind;
  amount: number | null;
  unit: RateUnit;
  values: Record<PayKind, { amount: number | null; unit: RateUnit }>;
  note: string;
  submittedAt: Date;
  reviewedByName: string;
  reviewedAt: Date | null;
  reviewNote: string;
};

/** Coach submissions, newest first. Pending ones are what an admin owes an answer to. */
export async function loadProposals(filters: { status?: string; coachId?: string } = {}): Promise<ProposalRow[]> {
  await dbConnect();
  const query: Record<string, any> = {};
  if (filters.status) query.status = filters.status;
  if (filters.coachId) query.coach = filters.coachId;

  const proposals = await CoachPayProposal.find(query)
    .populate("coach", "name username")
    .populate("classroom", "title")
    .populate("reviewedBy", "name username")
    .sort({ submittedAt: -1 })
    .lean();

  return (proposals as any[]).map((proposal) => ({
    id: idOf(proposal._id),
    kind: proposal.kind,
    status: proposal.status,
    coachId: idOf(proposal.coach),
    coachName: proposal.coach?.name || proposal.coach?.username || "Coach",
    classroomId: idOf(proposal.classroom),
    classroomTitle: proposal.classroom?.title || "Classroom",
    sessionId: proposal.sessionId || "",
    sessionDate: proposal.sessionDate ? new Date(proposal.sessionDate) : null,
    payKind: (proposal.payKind as PayKind) || "substitute",
    amount: proposal.amount === null || proposal.amount === undefined ? null : Number(proposal.amount),
    unit: (proposal.unit as RateUnit) || "per_class",
    values: cardValues(proposal),
    note: proposal.note || "",
    submittedAt: new Date(proposal.submittedAt || proposal.createdAt || Date.now()),
    reviewedByName: proposal.reviewedBy?.name || proposal.reviewedBy?.username || "",
    reviewedAt: proposal.reviewedAt ? new Date(proposal.reviewedAt) : null,
    reviewNote: proposal.reviewNote || "",
  }));
}

/** How many submissions are waiting on an admin. Drives the badge in the nav. */
export async function countPendingProposals() {
  await dbConnect();
  return CoachPayProposal.countDocuments({ status: "pending" });
}
