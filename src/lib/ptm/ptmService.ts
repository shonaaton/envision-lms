import "server-only";
import mongoose, { Types, type ClientSession } from "mongoose";
import { dbConnect } from "@/lib/db";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { classroomsAsSeenByStudent } from "@/lib/classroomStudentExits";
import { visibleClassroomFilter } from "@/lib/classroomVisibility";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { resolveStudentContact } from "@/lib/studentContact";
import { raisePtmApprovalTask, resolvePtmApprovalTask, raisePtmScheduleTask, resolvePtmScheduleTask, cancelPtmTasks } from "@/lib/tasks/taskTriggers";
import { Ptm } from "@/models/Ptm";
import { Classroom } from "@/models/Classroom";
import { StudentPause } from "@/models/StudentPause";
import { User } from "@/models/User";
import { Notification } from "@/models/Fee";
import { InternalTask } from "@/models/InternalTask";
import { CREDIT_HOLDING_STATUSES, OPEN_PTM_STATUSES, PTM_LAUNCH, PTM_STATUSES, canGiveFeedback, nextPtmEligibleAt, ptmCreditSummary, ptmYearOf, ptmActionSchema, requestPtmSchema, serializePtm, type PtmViewer } from "./ptmRules";

export class PtmError extends Error { constructor(message: string, public status = 400) { super(message); } }
const idOf = (v: any) => String(v?._id ?? v ?? "");
const isStaff = (v: PtmViewer) => ["admin", "sub-admin"].includes(v.role);
const validId = (id: string) => { if (!Types.ObjectId.isValid(id)) throw new PtmError("PTM not found.", 404); };

export async function studentPtmCoaches(studentId: string) {
  await dbConnect();
  const classrooms: any[] = await Classroom.find({ students: studentId, isActive: { $ne: false }, isSessionInstance: { $ne: true }, classroomType: { $ne: "demo" }, status: { $ne: "cancelled" }, ...visibleClassroomFilter({ role: "student", userId: studentId }) })
    .select("coach instructor studentExits closedForStudents").populate("coach instructor", "name username role isActive").lean();
  const coaches = new Map<string, { id: string; name: string; classroom: string }>();
  for (const c of classroomsAsSeenByStudent(classrooms, studentId) as any[]) {
    if (c.studentHasLeft || (c.closedForStudents || []).some((s: any) => idOf(s) === studentId)) continue;
    const coach = c.coach ?? c.instructor;
    if (!coach?._id || coach.isActive === false || coach.role !== "instructor") continue;
    coaches.set(idOf(coach), { id: idOf(coach), name: coach.name || coach.username || "Coach", classroom: idOf(c) });
  }
  return [...coaches.values()];
}

async function creditContext(studentId: string, now: Date, session?: ClientSession) {
  const ptms: any[] = await Ptm.find({ student: studentId, status: { $in: CREDIT_HOLDING_STATUSES } }).session(session ?? null).lean();
  const summary = ptmCreditSummary(ptms.filter(p => p.ptmYear === ptmYearOf(now)), now);
  // Open requests and meeting spacing survive 1 October; only the pool resets.
  summary.nextEligibleAt = nextPtmEligibleAt(ptms);
  summary.openRequest = idOf(ptms.find(p => OPEN_PTM_STATUSES.includes(p.status))?._id) || null;
  return summary;
}
export async function getCreditSummary(studentId: string, now = new Date()) { await dbConnect(); return creditContext(studentId, now); }

/** A write to the student serializes all credit mutations across app instances.
 * Transaction retries re-read the pool after a concurrent request/schedule.
 * No balance or credit ledger is stored. */
async function mutateStudent<T>(studentId: string, run: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(async session => {
    const result = await User.updateOne({ _id: studentId }, { $inc: { __v: 1 } }, { session });
    if (!result.matchedCount) throw new PtmError("Student not found.", 404);
    return run(session);
  }) as Promise<T>;
}

export async function requestPtm(viewer: PtmViewer, raw: unknown, now = new Date()) {
  if (viewer.role !== "student" || !viewer.canCreate) throw new PtmError("You cannot request a PTM.", 403);
  const input = requestPtmSchema.parse(raw);
  if (now < PTM_LAUNCH) throw new PtmError("PTMs start on 1 October 2026.");
  if (input.preferredAt <= now) throw new PtmError("Choose a future preferred time.");
  await dbConnect();
  const coaches = await studentPtmCoaches(viewer.id);
  const coach = coaches.find(c => c.id === input.coach);
  if (!coach) throw new PtmError("Choose a coach from your running classrooms.");
  const ptm = await mutateStudent(viewer.id, async session => {
    const student: any = await User.findById(viewer.id).session(session).select("name username accountStatus isActive").lean();
    if (!student || student.isActive === false || student.accountStatus === "demo") throw new PtmError("PTMs are available to enrolled students only.", 403);
    if (await StudentPause.exists({ student: viewer.id, status: "active" }).session(session)) throw new PtmError("PTMs are unavailable while your enrolment is paused.");
    const summary = await creditContext(viewer.id, now, session);
    if (summary.openRequest) throw new PtmError("You already have an open PTM request.", 409);
    if (!summary.remaining) throw new PtmError("You have used all 12 PTM credits for this academic year.");
    if (summary.nextEligibleAt && input.preferredAt < new Date(summary.nextEligibleAt)) throw new PtmError(`Your next PTM can be from ${formatAcademyDateTime(summary.nextEligibleAt)} IST (30 days between PTMs).`);
    const [doc] = await Ptm.create([{ ...input, student: viewer.id, classroom: coach.classroom, studentName: student.name || student.username, coachName: coach.name, ptmYear: ptmYearOf(now), status: "requested" }], { session });
    return doc;
  });
  await raisePtmApprovalTask(ptm);
  await notify(ptm, [idOf(ptm.coach)], "PTM requested", `${ptm.studentName} requested a PTM for ${formatAcademyDateTime(ptm.preferredAt)} IST.`);
  return serializePtm(ptm, viewer);
}

export async function applyPtmAction(id: string, raw: unknown, viewer: PtmViewer, now = new Date()) {
  validId(id);
  const input = ptmActionSchema.parse(raw);
  await dbConnect();
  const existing: any = await Ptm.findById(id).select("student").lean();
  if (!existing) throw new PtmError("PTM not found.", 404);
  const ptm: any = await mutateStudent(idOf(existing.student), async session => {
    const p: any = await Ptm.findById(id).session(session);
    if (!p) throw new PtmError("PTM not found.", 404);
    const ownStudent = viewer.role === "student" && idOf(p.student) === viewer.id;
    const ownCoach = viewer.role === "instructor" && idOf(p.coach) === viewer.id;
    const staff = isStaff(viewer);
    switch (input.action) {
      case "approve":
      case "reject": {
        if ((!ownCoach && !staff) || !viewer.canApprove) throw new PtmError("You cannot approve or reject this PTM.", 403);
        if (p.status !== "requested") throw new PtmError("Only requested PTMs can be approved or rejected.", 409);
        if (input.action === "approve") { p.status = "approved"; p.approvedBy = viewer.id; p.approvedAt = now; }
        else { p.status = "rejected"; p.rejectedBy = viewer.id; p.rejectedAt = now; p.rejectionReason = input.rejectionReason; }
        break;
      }
      case "schedule":
      case "reschedule": {
        if (!staff || !viewer.canEdit || (p.status === "requested" && !viewer.canApprove)) throw new PtmError("You cannot schedule this PTM.", 403);
        if (input.action === "schedule" ? !OPEN_PTM_STATUSES.includes(p.status) : p.status !== "scheduled") throw new PtmError("This PTM cannot be scheduled in its current status.", 409);
        if (input.action === "reschedule" && (p.feedback?.submittedAt || new Date(p.scheduledAt) <= now)) throw new PtmError("A PTM that has started cannot be rescheduled.", 409);
        if (input.scheduledAt <= now) throw new PtmError("Choose a future final time.");
        // Final times cannot bypass the spacing rule in either direction.
        const others: any[] = await Ptm.find({ student: p.student, _id: { $ne: p._id }, status: { $in: CREDIT_HOLDING_STATUSES } }).session(session).lean();
        if (others.some(o => Math.abs(input.scheduledAt.getTime() - new Date(o.scheduledAt ?? o.preferredAt).getTime()) < 30 * 86400_000)) throw new PtmError("Keep at least 30 days between this student's PTMs.");
        if (p.status === "requested") { p.approvedBy = viewer.id; p.approvedAt = now; }
        p.status = "scheduled"; p.scheduledAt = input.scheduledAt; p.durationMinutes = input.durationMinutes; p.meetingUrl = input.meetingUrl; p.scheduledBy = viewer.id;
        break;
      }
      case "cancel":
        if (!(ownStudent && viewer.canCreate && OPEN_PTM_STATUSES.includes(p.status)) && !(staff && viewer.canEdit)) throw new PtmError("You cannot cancel this PTM.", 403);
        if (!["requested", "approved", "scheduled"].includes(p.status) || (p.scheduledAt && new Date(p.scheduledAt) <= now)) throw new PtmError("This PTM can no longer be cancelled.", 409);
        p.status = "cancelled"; p.cancelledBy = viewer.id; p.cancelledAt = now; p.cancelReason = input.cancelReason;
        break;
      case "feedback":
        if (!ownStudent || !viewer.canCreate) throw new PtmError("You cannot rate this PTM.", 403);
        if (!canGiveFeedback(p, now)) throw new PtmError("Feedback is available once, after the PTM ends.", 409);
        p.feedback = { rating: input.rating, preparedness: input.preparedness, clarity: input.clarity, comments: input.comments, submittedAt: now };
        break;
    }
    await p.save({ session }); return p;
  });
  if (input.action === "approve") { await resolvePtmApprovalTask(id, viewer.id); await raisePtmScheduleTask(ptm); }
  if (["schedule", "reschedule"].includes(input.action)) { await resolvePtmApprovalTask(id, viewer.id); await resolvePtmScheduleTask(id, viewer.id); }
  if (["reject", "cancel"].includes(input.action)) await cancelPtmTasks(id, input.action === "reject" ? ptm.rejectionReason : ptm.cancelReason);
  if (input.action !== "feedback") {
    const recipients = ["approve", "reject"].includes(input.action) ? [idOf(ptm.student)] : [idOf(ptm.student), idOf(ptm.coach)];
    const message = ["schedule", "reschedule"].includes(input.action) ? `PTM with ${ptm.coachName}: ${formatAcademyDateTime(ptm.scheduledAt)} IST. Join from the PTM page 10 minutes before.` : `Your PTM is ${ptm.status}.${ptm.status === "rejected" ? ` ${ptm.rejectionReason}` : ptm.status === "cancelled" ? ` ${ptm.cancelReason}` : ""}`;
    await notify(ptm, recipients, `PTM ${ptm.status}`, message);
    if (["schedule", "reschedule"].includes(input.action)) await scheduledEmail(ptm, message);
  }
  return serializePtm(ptm, viewer);
}

async function notify(ptm: any, users: string[], title: string, message: string) {
  await Promise.all(users.map(user => Notification.create({ user, type: "ptm", title, message, metadata: { href: "/ptm", ptmId: idOf(ptm) } }).catch(error => console.error("[ptm] notification failed", error))));
}
async function scheduledEmail(ptm: any, message: string) {
  try {
    const student: any = await User.findById(ptm.student).select("name username email parentName parentEmail").lean();
    const contact = resolveStudentContact(student);
    if (!contact.email) return;
    const base = resolvePublicAppUrl();
    await sendAutomationEmail({ to: contact.email, subject: `PTM with ${ptm.coachName} confirmed`, message, actionUrl: base ? `${base}/ptm` : undefined, actionLabel: "View PTM", metadata: { kind: "ptm_scheduled", ptmId: idOf(ptm), scheduledAt: ptm.scheduledAt.toISOString(), href: "/ptm", revision: ptm.updatedAt?.toISOString() } });
  } catch (error) { console.error("[ptm] email failed", error); }
}

export async function listPtms(viewer: PtmViewer, filter: { status?: string; coach?: string; q?: string } = {}) {
  await dbConnect();
  const query: any = viewer.role === "student" ? { student: viewer.id } : viewer.role === "instructor" ? { coach: viewer.id } : {};
  if (filter.status && (PTM_STATUSES as readonly string[]).includes(filter.status)) query.status = filter.status;
  if (isStaff(viewer) && filter.coach && Types.ObjectId.isValid(filter.coach)) query.coach = filter.coach;
  if (isStaff(viewer) && filter.q) { const escaped = filter.q.slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); query.$or = [{ studentName: { $regex: escaped, $options: "i" } }, { coachName: { $regex: escaped, $options: "i" } }]; }
  const rows: any[] = await Ptm.find(query).sort({ createdAt: -1 }).lean();
  return { ptms: rows.map(p => serializePtm(p, viewer)), ...(viewer.role === "student" ? { credits: await getCreditSummary(viewer.id), coaches: await studentPtmCoaches(viewer.id) } : {}) };
}
export async function getPtmSummary(viewer: PtmViewer) {
  await dbConnect();
  const pendingCount = viewer.role === "student" ? 0 : await Ptm.countDocuments(viewer.role === "instructor" ? { coach: viewer.id, status: "requested" } : { status: { $in: OPEN_PTM_STATUSES } });
  const query = viewer.role === "student" ? { student: viewer.id } : viewer.role === "instructor" ? { coach: viewer.id } : {};
  const next: any = await Ptm.findOne({ ...query, status: "scheduled", $expr: { $gte: [{ $add: ["$scheduledAt", { $multiply: [{ $add: [{ $ifNull: ["$durationMinutes", 30] }, 60] }, 60_000] }] }, new Date()] } }).sort({ scheduledAt: 1 }).lean();
  return { pendingCount, nextPtm: next ? serializePtm(next, viewer) : null, ...(viewer.role === "student" ? { credits: await getCreditSummary(viewer.id) } : {}) };
}
export async function getJoinPtm(id: string, viewer: PtmViewer) {
  validId(id); await dbConnect();
  const p: any = await Ptm.findById(id).lean();
  if (!p) throw new PtmError("PTM not found.", 404);
  if (!isStaff(viewer) && !((viewer.role === "student" && idOf(p.student) === viewer.id) || (viewer.role === "instructor" && idOf(p.coach) === viewer.id))) throw new PtmError("Forbidden", 403);
  return p;
}
export async function processPtmSweep(now = new Date()) {
  await dbConnect();
  const completed = await Ptm.updateMany({ status: "scheduled", $expr: { $lt: [{ $add: ["$scheduledAt", { $multiply: [{ $add: [{ $ifNull: ["$durationMinutes", 30] }, 60] }, 60_000] }] }, now] } }, { $set: { status: "completed" } });
  // Reconcile tasks too, so a transient task failure never strands a request.
  const pending: any[] = await Ptm.find({ status: { $in: OPEN_PTM_STATUSES } }).lean();
  for (const p of pending) {
    if (p.status === "requested") await raisePtmApprovalTask(p);
    else await resolvePtmApprovalTask(p._id);
    if (p.status === "approved" || now.getTime() - new Date(p.createdAt).getTime() >= 48 * 3600_000) await raisePtmScheduleTask(p);
  }
  // A task may be raised after a concurrent action has already settled it.
  // Repair those late tasks, including cancelled PTMs which are not above.
  const tasks: any[] = await InternalTask.find({ referenceType: { $in: ["PtmApproval", "PtmSchedule"] }, status: { $in: ["pending", "in_progress"] } }).select("referenceId").lean();
  const closed: any[] = await Ptm.find({ _id: { $in: tasks.map(t => t.referenceId) }, status: { $nin: OPEN_PTM_STATUSES } }).select("status rejectionReason cancelReason").lean();
  for (const p of closed) {
    if (["cancelled", "rejected"].includes(p.status)) await cancelPtmTasks(p._id, p.cancelReason || p.rejectionReason || "PTM closed.");
    else { await resolvePtmApprovalTask(p._id); await resolvePtmScheduleTask(p._id); }
  }
  return { completed: completed.modifiedCount };
}
