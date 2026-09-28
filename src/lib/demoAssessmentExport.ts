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
import { demoSubAdminEmails } from "@/lib/demoNotificationRecipients";
import type { Sheet, SheetColumn } from "@/lib/spreadsheet";
import { DemoFeedback } from "@/models/Onboarding";
import { User } from "@/models/User";

/**
 * The full demo assessment report as a spreadsheet.
 *
 * Who may download it: every admin, and the demo sub-admin(s) named in
 * `DEMO_SUB_ADMIN_NOTIFY_EMAILS` (Saptarshi by default). Not the rest of the
 * sub-admin bench - salespeople are sub-admins too, and this sheet holds every
 * lead's contact details and the coaches' internal notes.
 */
export async function canExportDemoAssessments(userId: unknown) {
  const id = String(userId || "");
  if (!Types.ObjectId.isValid(id)) return false;
  await dbConnect();
  const user: any = await User.findById(id).select("role email isActive").lean();
  if (!user || user.isActive === false) return false;
  if (user.role === "admin") return true;
  return user.role === "sub-admin" && demoSubAdminEmails().includes(String(user.email || "").trim().toLowerCase());
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

const COLUMNS: SheetColumn[] = [
  { label: "Student" },
  { label: "Parent" },
  { label: "Phone" },
  { label: "Email" },
  { label: "City" },
  { label: "Country" },
  { label: "Account status" },
  { label: "Demo date (IST)" },
  { label: "Demo status" },
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
];

export async function demoAssessmentReportSheet(): Promise<Sheet> {
  await dbConnect();
  const items: any[] = await DemoFeedback.find({})
    .populate("demoUser", "name email phone countryCode parentName city country accountStatus")
    .populate("booking", "startAt demoStatus salesOwnerName parentName")
    .populate("coach recommendedCoach salesPerson", "name")
    .sort({ submittedAt: -1, createdAt: -1 })
    .lean();

  const rows = items.map((item) => {
    const student = item.demoUser || {};
    const booking = item.booking || {};
    // The student, coach and booking can be deleted after the demo; the
    // assessment keeps name snapshots for exactly that case.
    return [
      student.name || item.studentName || "",
      student.parentName || booking.parentName || "",
      contact(student),
      student.email || "",
      student.city || "",
      student.country || "",
      student.accountStatus ? (student.accountStatus === "demo" ? "Demo" : "Enrolled") : item.demoUser ? "" : "Account deleted",
      istLabel(booking.startAt || item.demoStartAt),
      String(booking.demoStatus || "").replace(/_/g, " ").toLowerCase(),
      ATTENDANCE_LABELS[String(item.attendanceStatus || "")] || "",
      item.coach?.name || item.coachName || "",
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
      item.status === "submitted" ? "Submitted" : "Draft",
      istLabel(item.submittedAt),
    ];
  });

  return { name: "Demo assessments", columns: COLUMNS, rows };
}
