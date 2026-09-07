import "server-only";

import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { Booking } from "@/models/Booking";
import { FeeAssignment } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Contact directory for the sales and relationship team.
 *
 * The `select()` list below is the security boundary, not the UI. `passwordHash`,
 * `tempPassword`, the reset-token fields and the admin-only `notes` field must
 * never be serialised here - the existing admin directory deliberately surfaces
 * temporary credentials, which is exactly why this is a separate query rather
 * than a reuse of that one.
 */

const CONTACT_FIELDS =
  "_id name email phone countryCode parentName parentEmail city country studentLevel accountStatus isActive isPaused pausedUntil batches createdAt";

export type DirectoryContact = {
  id: string;
  name: string;
  parentName: string;
  phone: string;
  email: string;
  city: string;
  level: string;
  status: string;
  statusTone: "active" | "paused" | "left" | "demo";
  batches: string[];
  coaches: string[];
  detail: string;
  joinedAt: string | null;
};

const LEVEL_LABELS: Record<string, string> = {
  absolute_beginner: "Absolute beginner",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  federated: "Federated",
  not_set: "Not set",
};

const DEMO_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Demo requested",
  COACH_ASSIGNED: "Coach assigned",
  APPROVED: "Demo booked",
  CLASSROOM_CREATED: "Demo scheduled",
  ASSESSMENT_PENDING: "Assessment pending",
  COMPLETED: "Demo completed",
  STUDENT_NO_SHOW: "No show",
  ABSENT: "Missed",
  RESCHEDULE_REQUESTED: "Reschedule requested",
  CANCELLED: "Cancelled",
  CONVERTED: "Converted",
  CLOSED: "Closed",
};

function id(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** "+91 9123456789", or an empty string when there is nothing to dial. */
function contactNumber(user: any) {
  const phone = String(user?.phone || "").trim();
  if (!phone) return "";
  const code = String(user?.countryCode || "").trim();
  return code && !phone.startsWith("+") && !phone.startsWith(code) ? `${code} ${phone}` : phone;
}

function studentStatus(user: any): { status: string; statusTone: DirectoryContact["statusTone"] } {
  if (user.isActive === false) return { status: "Left", statusTone: "left" };
  if (user.isPaused) return { status: "Paused", statusTone: "paused" };
  if (user.accountStatus === "demo") return { status: "Demo", statusTone: "demo" };
  return { status: "Active", statusTone: "active" };
}

export type DirectoryPayload = {
  students: DirectoryContact[];
  coaches: DirectoryContact[];
  demos: DirectoryContact[];
  generatedAt: string;
};

export async function getSalesDirectory(): Promise<DirectoryPayload> {
  await dbConnect();

  const [studentDocs, coachDocs, demoDocs, batches, assignments, demoBookings] = await Promise.all([
    User.find({ role: "student", accountStatus: { $ne: "demo" } }).select(CONTACT_FIELDS).sort({ name: 1 }).lean(),
    User.find({ role: "instructor" }).select(CONTACT_FIELDS).sort({ name: 1 }).lean(),
    User.find({ accountStatus: "demo" }).select(CONTACT_FIELDS).sort({ createdAt: -1 }).lean(),
    Batch.find({ isActive: true }).select("_id name coach students").populate("coach", "name").lean(),
    FeeAssignment.find({}).select("student type creditBalance").lean(),
    Booking.find({ bookingType: "demo" })
      .select("student demoStatus startAt assignedCoach instructor")
      .populate("assignedCoach", "name")
      .populate("instructor", "name")
      .sort({ startAt: -1 })
      .lean(),
  ]);

  const batchNameById = new Map<string, string>();
  const coachNamesByStudent = new Map<string, Set<string>>();
  const batchCountByCoach = new Map<string, number>();
  const studentCountByCoach = new Map<string, number>();

  for (const batch of batches as any[]) {
    batchNameById.set(id(batch._id), String(batch.name || ""));
    const coachId = id(batch.coach);
    const coachName = String((batch.coach as any)?.name || "");
    if (coachId) {
      batchCountByCoach.set(coachId, (batchCountByCoach.get(coachId) || 0) + 1);
      studentCountByCoach.set(coachId, (studentCountByCoach.get(coachId) || 0) + (batch.students || []).length);
    }
    if (!coachName) continue;
    for (const student of batch.students || []) {
      const key = id(student);
      if (!coachNamesByStudent.has(key)) coachNamesByStudent.set(key, new Set());
      coachNamesByStudent.get(key)!.add(coachName);
    }
  }

  const assignmentByStudent = new Map<string, any>();
  for (const assignment of assignments as any[]) assignmentByStudent.set(id(assignment.student), assignment);

  // Bookings are sorted newest-first, so the first one seen per student is theirs.
  const latestDemoByStudent = new Map<string, any>();
  for (const booking of demoBookings as any[]) {
    const key = id(booking.student);
    if (key && !latestDemoByStudent.has(key)) latestDemoByStudent.set(key, booking);
  }

  const toStudent = (user: any): DirectoryContact => {
    const key = id(user._id);
    const assignment = assignmentByStudent.get(key);
    const balance =
      assignment?.type === "credits"
        ? `${Number(assignment.creditBalance || 0)} credits left`
        : assignment
          ? "Monthly plan"
          : "No fee plan";
    return {
      id: key,
      name: String(user.name || ""),
      parentName: String(user.parentName || ""),
      phone: contactNumber(user),
      email: String(user.email || ""),
      city: String(user.city || ""),
      level: LEVEL_LABELS[String(user.studentLevel || "not_set")] || "Not set",
      ...studentStatus(user),
      batches: (user.batches || []).map((batch: any) => batchNameById.get(id(batch)) || "").filter(Boolean),
      coaches: Array.from(coachNamesByStudent.get(key) || []),
      detail: balance,
      joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    };
  };

  const toCoach = (user: any): DirectoryContact => {
    const key = id(user._id);
    return {
      id: key,
      name: String(user.name || ""),
      parentName: "",
      phone: contactNumber(user),
      email: String(user.email || ""),
      city: String(user.city || ""),
      level: "",
      status: user.isActive === false ? "Inactive" : "Active",
      statusTone: user.isActive === false ? "left" : "active",
      batches: (batches as any[]).filter((batch) => id(batch.coach) === key).map((batch) => String(batch.name || "")),
      coaches: [],
      detail: `${batchCountByCoach.get(key) || 0} batches - ${studentCountByCoach.get(key) || 0} students`,
      joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    };
  };

  const toDemo = (user: any): DirectoryContact => {
    const key = id(user._id);
    const booking = latestDemoByStudent.get(key);
    const coach = String((booking?.assignedCoach as any)?.name || (booking?.instructor as any)?.name || "");
    const when = booking?.startAt
      ? new Date(booking.startAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
      : "No demo booked";
    return {
      id: key,
      name: String(user.name || ""),
      parentName: String(user.parentName || ""),
      phone: contactNumber(user),
      email: String(user.email || ""),
      city: String(user.city || ""),
      level: LEVEL_LABELS[String(user.studentLevel || "not_set")] || "Not set",
      status: DEMO_STATUS_LABELS[String(booking?.demoStatus || "")] || "Demo account",
      statusTone: "demo",
      batches: [],
      coaches: coach ? [coach] : [],
      detail: coach ? `${when} - ${coach}` : when,
      joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    };
  };

  return {
    students: (studentDocs as any[]).map(toStudent),
    coaches: (coachDocs as any[]).map(toCoach),
    demos: (demoDocs as any[]).map(toDemo),
    generatedAt: new Date().toISOString(),
  };
}
