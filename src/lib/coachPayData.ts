import "server-only";

import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
// Registered for `populate("batches")`: a route that reaches Coach Pay without
// loading Batch anywhere else (Accounts) otherwise fails with MissingSchemaError.
import "@/models/Batch";
import { Booking } from "@/models/Booking";
import { User } from "@/models/User";
import { CoachPayPlan, CoachPayProposal, CoachRate, NoShowRuling, SessionPayOverride, type PayKind, type RateUnit } from "@/models/CoachPay";
import { buildPayEvents, coachBatchRate, withoutDeletedDemos, planFor, resolveRate, summarizePayEvents, REVIEWABLE_SESSION_STATUSES, type CoachPaySummary, type ResolvedRate } from "@/lib/coachPay";
import { StaffInvoice } from "@/models/StaffInvoice";
import { academyMonthOf, monthLabel } from "@/lib/feedback/feedbackCycleDates";
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
        "title level classroomType demoBooking coach instructor batches students durationMinutes classDate startDate startTime generatedSessions isSessionInstance"
      )
      .populate("coach instructor", "name username")
      .populate("batches", "name")
      .populate("generatedSessions.substituteCoach generatedSessions.conductedBy generatedSessions.assignedCoach", "name username")
      .lean(),
    CoachRate.find({ isActive: { $ne: false } }).lean(),
    SessionPayOverride.find({}).lean(),
    NoShowRuling.find({}).lean(),
  ]);
  const plans = await CoachPayPlan.find(filters.coachId ? { coach: filters.coachId } : {}).populate("coach", "name username").lean();

  const bookingIds = (classrooms as any[])
    .filter((classroom) => classroom.classroomType === "demo" && classroom.demoBooking)
    .map((classroom) => idOf(classroom.demoBooking));
  const [conversions, liveBookings] = await Promise.all([
    loadConversions(bookingIds),
    bookingIds.length ? Booking.find({ _id: { $in: bookingIds } }).select("_id").lean() : Promise.resolve([]),
  ]);
  // A demo whose booking has been deleted was removed from Demo Center (a test,
  // usually); its classroom can outlive it, but it is not paid or invoiced.
  const payableClassrooms = withoutDeletedDemos(classrooms as any[], (liveBookings as any[]).map((booking) => idOf(booking._id)));

  const events = buildPayEvents({
    classrooms: payableClassrooms,
    rates: rates as any[],
    overrides: overrides as any[],
    rulings: rulings as any[],
    conversions,
    range: { from: period.from, to: period.to },
    coachId: filters.coachId,
    plans: plans as any[],
    // A month's fixed pay belongs to no batch or classroom.
    skipMonthly: Boolean(filters.batchId || filters.classroomId),
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
      .populate("generatedSessions.substituteCoach generatedSessions.conductedBy generatedSessions.assignedCoach generatedSessions.students", "name username")
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
      const coachSource = [session.conductedBy, session.substituteCoach, session.assignedCoach, classroom.coach, classroom.instructor].find(
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

export type CoachBatchRateRow = {
  /** Batch id, or "" for a classroom that belongs to no batch. */
  batchId: string;
  /** Set only when `batchId` is "". */
  classroomId: string;
  title: string;
  /** The courses (classroom series) this batch has had with the coach, oldest first. */
  courses: string[];
  isActive: boolean;
  current: { amount: number; unit: RateUnit } | null;
  history: string[];
};

function levelLabel(level: unknown) {
  const text = String(level || "").replace(/_/g, " ").trim();
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}

/**
 * A coach's regular-class rates, one row per batch. A batch that moved on to a
 * new course has several classroom series under one batch code; they are one
 * row, because the coach's rate belongs to the batch.
 */
export async function loadCoachBatchRates(coachId: string, now = new Date()): Promise<CoachBatchRateRow[]> {
  await dbConnect();
  const [classrooms, cards] = await Promise.all([
    Classroom.find({
      isSessionInstance: { $ne: true },
      isTestClassroom: { $ne: true },
      classroomType: { $ne: "demo" },
      $or: [{ coach: coachId }, { instructor: coachId }],
    })
      .select("title level batches isActive createdAt generatedSessions.scheduledFor")
      .populate("batches", "name")
      .sort({ createdAt: 1 })
      .lean(),
    CoachRate.find({ coach: coachId, scope: { $in: ["classroom_coach", "batch_coach"] }, isActive: { $ne: false } }).lean(),
  ]);

  const groups = new Map<string, any[]>();
  for (const room of classrooms as any[]) {
    const batch = (room.batches || [])[0];
    const key = batch ? `b:${idOf(batch)}` : `c:${idOf(room._id)}`;
    groups.set(key, [...(groups.get(key) || []), room]);
  }

  const date = (value: unknown) =>
    new Date(value as any).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  const rows: CoachBatchRateRow[] = [];
  for (const [key, rooms] of groups) {
    const batch = key.startsWith("b:") ? rooms[0].batches[0] : null;
    const batchId = batch ? idOf(batch) : "";
    const roomIds = rooms.map((room) => idOf(room._id));
    const latest = rooms[rooms.length - 1];
    const firstClass = (room: any) =>
      Math.min(...(room.generatedSessions || []).map((session: any) => new Date(session.scheduledFor).getTime()).filter(Number.isFinite), Infinity);
    // "Rate now" is for the level running now; a level that has not started yet
    // is checked separately so a missing rate there is flagged, not hidden.
    const running = [...rooms].reverse().find((room) => firstClass(room) <= now.getTime()) || rooms[0];
    const rateFor = (room: any, date: Date) =>
      coachBatchRate({ coachId, classroomId: idOf(room._id), batchIds: batchId ? [batchId] : [], date, rates: cards as any[] });
    const current = rateFor(running, now);
    const upcoming = rooms.filter((room) => firstClass(room) > now.getTime());
    const sameTitle = rooms.every((room) => room.title === rooms[0].title);
    const relevant = (cards as any[])
      .filter(
        (card) =>
          card.regular?.amount !== null &&
          card.regular?.amount !== undefined &&
          ((card.scope === "batch_coach" && batchId && idOf(card.batch) === batchId) ||
            (card.scope === "classroom_coach" && roomIds.includes(idOf(card.classroom))))
      )
      .sort((a, b) => new Date(b.effectiveFrom || 0).getTime() - new Date(a.effectiveFrom || 0).getTime());
    const history = relevant
      .filter((card) => idOf(card._id) !== current?.rateId || new Date(card.effectiveFrom || 0).getTime() > 0)
      .map((card) => {
        const start = new Date(card.effectiveFrom || 0);
        const when = start.getTime() <= 0 ? "all classes" : `from ${date(start)}`;
        const room = card.scope === "classroom_coach" && rooms.length > 1 ? rooms.find((item) => idOf(item._id) === idOf(card.classroom)) : null;
        const course = room ? ` (${levelLabel(room.level) || "one course"})` : "";
        return `${idOf(card._id) === current?.rateId ? "now: " : ""}Rs. ${Number(card.regular.amount) / 100}${course} ${when}`;
      });
    rows.push({
      batchId,
      classroomId: batchId ? "" : idOf(latest._id),
      title: batch?.name || latest.title || "Batch",
      courses: rooms.map((room) => {
        const times = (room.generatedSessions || [])
          .map((session: any) => new Date(session.scheduledFor).getTime())
          .filter((time: number) => Number.isFinite(time))
          .sort((a: number, b: number) => a - b);
        const month = (time: number) => new Date(time).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
        const span = times.length
          ? times[0] > now.getTime()
            ? `from ${month(times[0])}`
            : month(times[0]) === month(times[times.length - 1])
              ? month(times[0])
              : `${month(times[0])} - ${month(times[times.length - 1])}`
          : "";
        const name = sameTitle ? levelLabel(room.level) || room.title : `${room.title}${room.level ? ` (${levelLabel(room.level)})` : ""}`;
        return `${name}${span ? `: ${span}` : ""}`;
      }),
      isActive: rooms.some((room) => room.isActive !== false),
      current: current ? { amount: current.amount, unit: current.unit } : null,
      history: [
        ...(relevant.length > 1 || (relevant[0] && new Date(relevant[0].effectiveFrom || 0).getTime() > 0) ? history : []),
        ...upcoming
          .filter((room) => !rateFor(room, new Date(firstClass(room))))
          .map((room) => `No rate yet for ${levelLabel(room.level) || room.title}, which starts ${date(firstClass(room))}`),
      ],
    });
  }
  return rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.title.localeCompare(b.title));
}

export type PayOverviewRow = {
  coachId: string;
  name: string;
  role: string;
  isActive: boolean;
  plan: { type: "per_class" | "per_hour" | "monthly"; detail: string } | null;
  /** A plan saved to start after this period - shown so a change dated ahead is not mistaken for a lost save. */
  upcoming: { type: "per_class" | "per_hour" | "monthly"; detail: string; startsLabel: string } | null;
  /** Regular and substitution classes - demos are counted separately. */
  classes: number;
  demoClasses: number;
  minutes: number;
  earned: number;
  unpriced: number;
  pendingReview: number;
  invoice: { id: string; number: string; status: string; total: number } | null;
};

function planDetail(plan: any) {
  const money = (paise: unknown) =>
    paise === null || paise === undefined ? "not set" : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(paise) / 100)}`;
  if (plan.type === "monthly") return `${money(plan.monthlyAmount)} a month`;
  if (plan.type === "per_hour") return `${money(plan.hourlyRate)} an hour`;
  return "Batch rates";
}

/**
 * Everyone the academy pays, in one list: every active coach, plus anyone else
 * with a pay plan or with classes in the period. Joined to the period's pay
 * summary, their plan in force at the end of the period, and - for a single
 * month - their invoice for it.
 */
export async function loadPayOverview(period: PayPeriod, summary: CoachPaySummary): Promise<PayOverviewRow[]> {
  await dbConnect();
  const monthKey = period.month || "";
  const [people, plans, invoices] = await Promise.all([
    User.find({ role: { $in: ["instructor", "admin", "sub-admin"] } }).select("name username role isActive").sort({ name: 1 }).lean(),
    CoachPayPlan.find({}).lean(),
    monthKey ? StaffInvoice.find({ month: monthKey }).select("staff invoiceNumber status total").lean() : Promise.resolve([]),
  ]);
  const summaryByCoach = new Map(summary.rows.map((row) => [row.coachId, row]));
  const planAt = new Date(Math.min(period.to.getTime(), Date.now()));
  const invoiceByStaff = new Map((invoices as any[]).map((invoice) => [idOf(invoice.staff), invoice]));

  const rows: PayOverviewRow[] = [];
  for (const person of people as any[]) {
    const coachId = idOf(person._id);
    const plan = planFor(plans as any[], coachId, planAt);
    const next = (plans as any[])
      .filter((item) => idOf(item.coach) === coachId && new Date(item.effectiveFrom) > planAt)
      .sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime())[0];
    const pay = summaryByCoach.get(coachId);
    const include = (person.role === "instructor" && person.isActive !== false) || plan || next || pay;
    if (!include) continue;
    const invoice = invoiceByStaff.get(coachId);
    rows.push({
      coachId,
      name: person.name || person.username || "Coach",
      role: person.role,
      isActive: person.isActive !== false,
      plan: plan ? { type: plan.type, detail: planDetail(plan) } : null,
      upcoming: next ? { type: next.type, detail: planDetail(next), startsLabel: monthLabel(academyMonthOf(new Date(next.effectiveFrom))) } : null,
      classes: pay ? pay.regularClasses + pay.substitutionClasses : 0,
      demoClasses: pay?.demoClasses || 0,
      minutes: pay?.minutes || 0,
      earned: pay?.totalAmount || 0,
      unpriced: pay?.unpriced || 0,
      pendingReview: pay?.pendingReview || 0,
      invoice: invoice ? { id: idOf(invoice._id), number: invoice.invoiceNumber, status: invoice.status, total: Number(invoice.total || 0) } : null,
    });
  }
  // People needing attention first, then the biggest amounts.
  return rows.sort(
    (a, b) =>
      Number(b.unpriced > 0 || !b.plan) - Number(a.unpriced > 0 || !a.plan) || b.earned - a.earned || a.name.localeCompare(b.name)
  );
}

export type PayPlanRow = {
  id: string;
  type: "per_class" | "per_hour" | "monthly";
  effectiveFrom: Date;
  hourlyRate: number | null;
  monthlyAmount: number | null;
  demoRate: number | null;
  substituteRate: number | null;
  conversionBonus: number | null;
  note: string;
};

function nullable(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

/** A coach's pay plans, newest first, and the one in force now. */
export async function loadCoachPayPlans(coachId: string, now = new Date()) {
  await dbConnect();
  const plans = (await CoachPayPlan.find({ coach: coachId }).sort({ effectiveFrom: -1 }).lean()) as any[];
  const rows: PayPlanRow[] = plans.map((plan) => ({
    id: idOf(plan._id),
    type: plan.type,
    effectiveFrom: new Date(plan.effectiveFrom),
    hourlyRate: nullable(plan.hourlyRate),
    monthlyAmount: nullable(plan.monthlyAmount),
    demoRate: nullable(plan.demoRate),
    substituteRate: nullable(plan.substituteRate),
    conversionBonus: nullable(plan.conversionBonus),
    note: plan.note || "",
  }));
  return { plans: rows, current: rows.find((row) => row.effectiveFrom <= now) || null };
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
    classroomTitle: proposal.kind === "coach_rate" ? "All demo classes" : proposal.classroom?.title || "Classroom",
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
