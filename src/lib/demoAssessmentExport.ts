import "server-only";

import { Types } from "mongoose";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { courseTierLabel } from "@/lib/courseTiers";
import { dbConnect } from "@/lib/db";
import {
  CALCULATION_POWER,
  ENDGAME_KNOWLEDGE,
  OVERALL_STRENGTH,
  POSITIONAL_SENSE,
  TACTICAL_STRENGTH,
  scaleLabel,
} from "@/lib/demoAssessmentScales";
import { isConfirmedDemo } from "@/lib/demoClassroom";
import { demoSubAdminEmails } from "@/lib/demoNotificationRecipients";
import { canAccessFeature } from "@/lib/featureAccess";
import type { Sheet, SheetColumn } from "@/lib/spreadsheet";
import { Activity } from "@/models/Activity";
import { Booking } from "@/models/Booking";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";
import { DemoFeedback } from "@/models/Onboarding";
import { User } from "@/models/User";

/**
 * The full demo report as a spreadsheet: every demo lead, assessed or not.
 *
 * Who may download it: every admin, the demo sub-admin(s) named in
 * `DEMO_SUB_ADMIN_NOTIFY_EMAILS` (Saptarshi by default), and any role granted
 * Demo Center's `export` permission (the Marketing role, by default). Not the
 * rest of the sub-admin bench - salespeople are sub-admins too, and this sheet
 * holds every lead's contact details and the coaches' internal notes.
 */
export async function canExportDemoAssessments(userId: unknown) {
  const id = String(userId || "");
  if (!Types.ObjectId.isValid(id)) return false;
  await dbConnect();
  const user: any = await User.findById(id).select("role email isActive").lean();
  if (!user || user.isActive === false) return false;
  if (user.role === "admin") return true;
  if (user.role === "sub-admin" && demoSubAdminEmails().includes(String(user.email || "").trim().toLowerCase())) return true;
  return canAccessFeature("demoCenter", { id, role: user.role } as any, "export");
}

const CLASS_TYPE_LABELS: Record<string, string> = { group: "Group", individual: "Individual", either: "Either works" };
const ENGAGEMENT_LABELS: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
const ATTENDANCE_LABELS: Record<string, string> = { present: "Present", absent: "Absent", student_no_show: "Student no-show" };

function istLabel(value: unknown) {
  // Written as IST text rather than a date cell: a date cell is rendered in the
  // server's own timezone, which on the VPS is UTC.
  return value ? formatAcademyDateTime(value as any, { timeZoneName: "short" }) : "";
}

function yesNo(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

function contact(student: any) {
  return [student?.countryCode, student?.phone].filter(Boolean).join(" ").trim();
}

function startingPoint(item: any) {
  const topic = String(item.recommendedStartingTopic || "").trim();
  const session = Number(item.recommendedStartingSession || 0);
  if (!topic) return "";
  return session ? `Session ${session} - ${topic}` : topic;
}

function idOf(value: any) {
  return String(value?._id || value || "");
}

const DEMO_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  COACH_ASSIGNED: "Coach assigned",
  APPROVED: "Approved",
  CLASSROOM_CREATED: "Classroom created",
  ASSESSMENT_PENDING: "Assessment pending",
  COMPLETED: "Completed",
  STUDENT_NO_SHOW: "Student no-show",
  ABSENT: "Absent",
  CANCELLED: "Cancelled",
  RESCHEDULE_REQUESTED: "Reschedule requested",
  CONVERTED: "Converted",
  CLOSED: "Demo Closed",
  // The retired Demo Hold status, folded into Demo Closed.
  ON_HOLD: "Demo Closed",
};

/**
 * Where a lead sits in the Demo Center today, named after the tab it appears
 * in. Follows `classifyDemo` in app/(dashboard)/admin/demo-center/page.tsx -
 * keep the two in step. A lead with no demo booking (an account created or
 * converted straight from the CRM) is named for what its account shows.
 */
export function demoLeadStage(booking: any, student: any, now = Date.now()) {
  if (booking?._id) {
    const status = String(booking.demoStatus || "");
    if (booking.archivedAt) return "History (archived)";
    if (status === "CONVERTED") return "Converted";
    if (["CLOSED", "CANCELLED", "ON_HOLD"].includes(status) || booking.status === "cancelled") return "Demo Closed";
    if (status === "STUDENT_NO_SHOW" || status === "ABSENT") return "No Show / Missed";
    if (status === "ASSESSMENT_PENDING") return "Completed - assessment pending";
    if (booking.feedbackStatus === "submitted" || status === "COMPLETED") return "Completed";
    if (isConfirmedDemo(booking)) {
      const over = new Date(booking.endAt || booking.startAt || 0).getTime() < now;
      return over ? "Booked - demo time passed, outcome not marked" : "Booked / Upcoming";
    }
    return booking.needsNewTime ? "Requested - needs a new time" : "Requested";
  }
  if (!student?._id) return "Demo deleted";
  if (student.conversionSetup?.convertedAt || student.accountStatus !== "demo") return "Converted (no demo booking)";
  return "Demo account - no demo booked";
}

const LEAD_COLUMNS: SheetColumn[] = [
  { label: "Student" },
  { label: "Parent" },
  { label: "Phone" },
  { label: "Email" },
  { label: "Current stage" },
  { label: "CRM stage" },
  { label: "CRM stage since (IST)" },
  { label: "City" },
  { label: "Country" },
  { label: "Account status" },
  { label: "Demo requested (IST)" },
  { label: "Demo date (IST)" },
  { label: "Demo status" },
  { label: "Archived" },
  { label: "Close / cancel reason" },
  { label: "Reschedules", type: "number" },
  { label: "Converted (IST)" },
  { label: "Attendance" },
  { label: "Coach" },
  { label: "Salesperson (lead owner)" },
  { label: "Salesperson present" },
  { label: "Salesperson in call" },
  { label: "Chess level" },
  { label: "Playing strength" },
  { label: "FIDE rated" },
  { label: "FIDE rating", type: "number" },
  { label: "Chess.com rating", type: "number" },
  { label: "Lichess rating", type: "number" },
  { label: "Calculation power" },
  { label: "Tactical strength" },
  { label: "Endgame knowledge" },
  { label: "Positional sense" },
  { label: "Overall strength" },
  { label: "Student engagement" },
  { label: "Recommended class type" },
  { label: "Recommended course level" },
  { label: "Recommended sub-level" },
  { label: "Starts at" },
  { label: "Suggested class frequency" },
  { label: "Recommended coach" },
  { label: "Strengths" },
  { label: "Weaknesses" },
  { label: "Assessment notes" },
  { label: "Coach comments" },
  { label: "Summary for parent" },
  { label: "Notes for sales" },
  { label: "Internal coach notes" },
  { label: "Assessment status" },
  { label: "Submitted (IST)" },
  { label: "Last activity (IST)" },
  { label: "Journey" },
];

const JOURNEY_COLUMNS: SheetColumn[] = [
  { label: "Student" },
  { label: "Phone" },
  { label: "Demo date (IST)" },
  { label: "Current stage" },
  { label: "When (IST)" },
  { label: "Step" },
  { label: "By" },
  { label: "Where" },
  { label: "Details" },
];

const NOT_ASSESSED: any = {};
// Excel refuses a cell longer than this.
const MAX_CELL = 32000;

// Conversions are recorded against the student, not the booking.
const CONVERSION_TYPES = ["demo.student.converted", "demo.converted.crm"];

type JourneyEvent = { at: Date; step: string; by: string; where: string; details: string };

function activityDetails(activity: any) {
  const meta = activity.metadata || {};
  return String(meta.reason || meta.previousCloseReason || meta.stage || "").trim();
}

function journeyText(events: JourneyEvent[]) {
  const text = events.map((event) => [istLabel(event.at), event.step, event.by ? `by ${event.by}` : ""].filter(Boolean).join(" - ")).join("\n");
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}\n...` : text;
}

/**
 * Everything the report needs, read once for both sheets. One lead per demo
 * booking (archived ones included), a lead per assessment whose booking was
 * deleted, and a lead per demo or converted account that never booked a demo.
 */
async function loadDemoLeads() {
  await dbConnect();
  const [bookings, items]: [any[], any[]] = await Promise.all([
    Booking.find({ bookingType: "demo" })
      .select("student instructor assignedCoach startAt endAt status demoStatus feedbackStatus needsNewTime cancellationReason previousCloseReason holdReason archiveReason rescheduleCount salesOwnerName parentName city country archivedAt createdAt")
      .populate("student", "name email phone countryCode parentName city country accountStatus conversionSetup.convertedAt")
      .populate("instructor assignedCoach", "name")
      .sort({ startAt: -1, createdAt: -1 })
      .lean(),
    DemoFeedback.find({})
      .populate("demoUser", "name email phone countryCode parentName city country accountStatus conversionSetup.convertedAt")
      .populate("coach recommendedCoach salesPerson", "name")
      .sort({ submittedAt: -1, createdAt: -1 })
      .lean(),
  ]);

  const assessmentsByBooking = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.booking || "");
    assessmentsByBooking.set(key, [...(assessmentsByBooking.get(key) || []), item]);
  }
  const leads: Array<{ booking: any; item: any; student: any }> = [];
  for (const booking of bookings) {
    const key = String(booking._id);
    const assessments = assessmentsByBooking.get(key) || [NOT_ASSESSED];
    assessmentsByBooking.delete(key);
    assessments.forEach((item) => leads.push({ booking, item, student: booking.student || item.demoUser || {} }));
  }
  for (const orphans of Array.from(assessmentsByBooking.values())) orphans.forEach((item) => leads.push({ booking: {}, item, student: item.demoUser || {} }));

  // Leads the CRM created or converted without a demo ever being booked.
  const coveredStudents = new Set(leads.map((lead) => idOf(lead.student)).filter(Boolean));
  const unbooked: any[] = await User.find({
    role: "student",
    $or: [{ accountStatus: "demo" }, { "conversionSetup.convertedAt": { $exists: true } }],
  })
    .select("name email phone countryCode parentName city country accountStatus conversionSetup.convertedAt createdAt")
    .sort({ createdAt: -1 })
    .lean();
  for (const student of unbooked) {
    if (!coveredStudents.has(idOf(student))) leads.push({ booking: {}, item: NOT_ASSESSED, student });
  }

  const bookingIds = bookings.map((booking) => booking._id);
  const studentIds = Array.from(new Set(leads.map((lead) => idOf(lead.student)).filter((id) => Types.ObjectId.isValid(id))));
  const [activities, crmRecords]: [any[], any[]] = await Promise.all([
    Activity.find({
      $or: [
        { entityType: "Booking", entityId: { $in: bookingIds } },
        { entityType: "User", entityId: { $in: studentIds }, type: { $in: CONVERSION_TYPES } },
      ],
    })
      .select("actor type label entityType entityId metadata occurredAt")
      .populate("actor", "name")
      .sort({ occurredAt: 1 })
      .lean(),
    CrmLeadRecord.find({ portalUser: { $in: studentIds } })
      .select("portalUser stage stageChangedAt stageHistory lastEventAt")
      .sort({ lastEventAt: -1 })
      .lean(),
  ]);

  // The newest CRM lead per student, when a family has more than one.
  const crmByStudent = new Map<string, any>();
  for (const record of crmRecords) {
    const key = idOf(record.portalUser);
    if (!crmByStudent.has(key)) crmByStudent.set(key, record);
  }

  // Student-level events (conversions, CRM moves) belong to one lead row each:
  // the booking a conversion names, otherwise the student's latest demo.
  const leadKey = (lead: { booking: any; student: any }) => (lead.booking?._id ? `b:${lead.booking._id}` : `s:${idOf(lead.student)}`);
  const latestLeadOfStudent = new Map<string, string>();
  for (const lead of leads) {
    const studentId = idOf(lead.student);
    if (studentId && !latestLeadOfStudent.has(studentId)) latestLeadOfStudent.set(studentId, leadKey(lead));
  }
  const eventsByLead = new Map<string, JourneyEvent[]>();
  const addEvent = (key: string | undefined, event: JourneyEvent) => {
    if (!key || !event.at) return;
    eventsByLead.set(key, [...(eventsByLead.get(key) || []), event]);
  };
  const bookingKeys = new Set(bookingIds.map((id) => `b:${id}`));

  for (const activity of activities) {
    const event = {
      at: activity.occurredAt,
      step: String(activity.label || activity.type || ""),
      by: activity.actor?.name || "",
      where: String(activity.type || "").startsWith("crm.") || activity.type === "demo.converted.crm" ? "CRM sync" : "Portal",
      details: activityDetails(activity),
    };
    if (activity.entityType === "Booking") {
      addEvent(`b:${activity.entityId}`, event);
    } else {
      const named = activity.metadata?.booking ? `b:${activity.metadata.booking}` : "";
      addEvent(bookingKeys.has(named) ? named : latestLeadOfStudent.get(idOf(activity.entityId)), event);
    }
  }
  // Moves made inside Kraya. The portal's own pushes are already in Activity
  // as "CRM stage set to ...", so only the CRM side's are added here.
  for (const [studentId, record] of Array.from(crmByStudent.entries())) {
    for (const move of record.stageHistory || []) {
      if (move.source === "portal") continue;
      addEvent(latestLeadOfStudent.get(studentId), {
        at: move.at,
        step: `CRM stage moved to ${move.stage}`,
        by: move.actorName || "",
        where: move.source === "import" ? "CRM import" : "CRM (Kraya)",
        details: "",
      });
    }
  }
  // Older bookings predate the activity log; their request still starts the story.
  for (const booking of bookings) {
    const key = `b:${booking._id}`;
    if (!eventsByLead.has(key) && booking.createdAt) addEvent(key, { at: booking.createdAt, step: "Demo request created", by: "", where: "Portal", details: "" });
  }
  for (const events of Array.from(eventsByLead.values())) events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return { leads, crmByStudent, eventsByLead, leadKey };
}

/** The two sheets of the Demo Center download: one row per lead, then every step of every lead's journey. */
export async function demoLeadReportSheets(now = Date.now()): Promise<Sheet[]> {
  const { leads, crmByStudent, eventsByLead, leadKey } = await loadDemoLeads();
  const leadRows: unknown[][] = [];
  const journeyRows: unknown[][] = [];
  // A booking with two assessments is two lead rows; its journey is listed once.
  const journeyListed = new Set<string>();

  for (const { booking, item, student } of leads) {
    const assessed = item !== NOT_ASSESSED;
    const stage = demoLeadStage(booking, student, now);
    const crm = crmByStudent.get(idOf(student));
    const key = leadKey({ booking, student });
    const events = eventsByLead.get(key) || [];
    const lastEvent = events[events.length - 1];
    const name = student.name || item.studentName || "";
    const demoDate = istLabel(booking.startAt || item.demoStartAt);

    // The student, coach and booking can be deleted after the demo; the
    // assessment keeps name snapshots for exactly that case.
    leadRows.push([
      name,
      student.parentName || booking.parentName || "",
      contact(student),
      student.email || "",
      stage,
      crm?.stage || "",
      istLabel(crm?.stageChangedAt),
      student.city || booking.city || "",
      student.country || booking.country || "",
      student.accountStatus ? (student.accountStatus === "demo" ? "Demo" : "Enrolled") : booking.student || item.demoUser ? "" : "Account deleted",
      istLabel(booking.createdAt),
      demoDate,
      DEMO_STATUS_LABELS[String(booking.demoStatus || "")] || "",
      booking.archivedAt ? "Yes" : "",
      booking.cancellationReason || booking.previousCloseReason || booking.holdReason || booking.archiveReason || "",
      booking._id ? Number(booking.rescheduleCount || 0) : "",
      istLabel(student.conversionSetup?.convertedAt),
      ATTENDANCE_LABELS[String(item.attendanceStatus || "")] || "",
      item.coach?.name || item.coachName || booking.assignedCoach?.name || booking.instructor?.name || "",
      booking.salesOwnerName || "",
      yesNo(item.salesPersonPresent),
      item.salesPerson?.name || item.salesPersonName || "",
      item.chessLevel || "",
      item.playingStrength || "",
      yesNo(item.hasFideRating),
      item.fideRating ?? "",
      item.chessComRating ?? "",
      item.lichessRating ?? "",
      scaleLabel(CALCULATION_POWER, item.calculationPower),
      scaleLabel(TACTICAL_STRENGTH, item.tacticalStrength),
      scaleLabel(ENDGAME_KNOWLEDGE, item.endgameKnowledge),
      scaleLabel(POSITIONAL_SENSE, item.positionalSense),
      scaleLabel(OVERALL_STRENGTH, item.overallStrength),
      ENGAGEMENT_LABELS[String(item.studentEngagement || "")] || "",
      CLASS_TYPE_LABELS[String(item.coachRecommendation || "")] || "",
      courseTierLabel(item.recommendedCourseLevel) || item.recommendedCourseLevel || "",
      item.recommendedSubLevel || "",
      startingPoint(item),
      item.suggestedClassFrequency || "",
      item.recommendedCoach?.name || "",
      item.strengths || "",
      item.weaknesses || "",
      item.assessmentNotes || "",
      item.coachComments || "",
      item.parentFacingSummary || "",
      item.salesAdminNotes || "",
      item.internalCoachNotes || "",
      !assessed ? "Not assessed" : item.status === "submitted" ? "Submitted" : "Draft",
      istLabel(item.submittedAt),
      istLabel(lastEvent?.at),
      journeyText(events),
    ]);

    if (journeyListed.has(key)) continue;
    journeyListed.add(key);
    for (const event of events) {
      journeyRows.push([name, contact(student), demoDate, stage, istLabel(event.at), event.step, event.by, event.where, event.details]);
    }
  }

  return [
    { name: "Demo leads", columns: LEAD_COLUMNS, rows: leadRows },
    { name: "Demo journey", columns: JOURNEY_COLUMNS, rows: journeyRows },
  ];
}

/** Just the per-lead sheet. */
export async function demoAssessmentReportSheet(): Promise<Sheet> {
  const [leads] = await demoLeadReportSheets();
  return leads;
}
