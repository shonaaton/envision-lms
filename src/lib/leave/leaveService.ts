import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { academyDateKey } from "@/lib/academyTime";
import { flattenScheduledSessions, isSessionOffSchedule } from "@/lib/classroomSessions";
import { coachClassroomQuery } from "@/lib/classroomCoachAccess";
import { cancelLeaveSubstitutionTask, raiseLeaveSubstitutionTask, resolveLeaveSubstitutionTask } from "@/lib/tasks/taskTriggers";
import { AccessRole } from "@/models/AccessRole";
import { Classroom } from "@/models/Classroom";
import { LeaveCreditAccount, LeaveCreditEntry, LeaveRequest } from "@/models/Leave";
import { User } from "@/models/User";
import {
  FULL_DAY_NOTICE_HOURS,
  LEAVE_HREF,
  MARKETING_ACCESS_ROLE_NAME_KEY,
  MAX_HALF_DAY_CLASSES,
  MAX_LEAVE_DAYS_AHEAD,
  applyLeaveSchema,
  availableCredits,
  cancelBlockReason,
  creditCheckError,
  creditCost,
  describeLeaveSessions,
  effectiveCoachId,
  formatCredits,
  halfDayNoticeHours,
  isSessionCovered,
  leaveActionSchema,
  leaveCreditActionSchema,
  leaveDayLabel,
  leaveSessionKey,
  leaveStartsAt,
  leaveTypeLabel,
  noticeError,
  serializeLeave,
  type LeaveCoverage,
  type LeaveViewer,
} from "./leaveRules";
import { adminRecipients, approverRecipients, leaveUserRecipient, namedApproverRecipients, type LeaveRecipient } from "./leaveRecipients";
import { notifyLeave } from "./leaveNotifications";

export class LeaveError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const DAY_MS = 24 * 3600_000;
const idOf = (value: any) => String(value?._id ?? value ?? "");
const validId = (id: string, noun = "Leave request") => {
  if (!Types.ObjectId.isValid(id)) throw new LeaveError(`${noun} not found.`, 404);
};
const hrefFor = (leave: any) => `${LEAVE_HREF}?id=${idOf(leave)}`;
const lowerType = (type: string) => (type === "full_day" ? "full-day" : "half-day");

// ---------------------------------------------------------------------------
// Classes the applicant teaches on a day
// ---------------------------------------------------------------------------

export type TeachingClass = { classroom: string; sessionId: string; title: string; start: Date; end: Date; studentCount: number };

/**
 * The classes this person still teaches on an IST day: scheduled, not started,
 * not on a paused or closed classroom, and not already handed to a substitute.
 * Only real `generatedSessions` are offered - a per-session substitute needs a
 * session id to attach to.
 */
export async function teachingClassesOn(userId: string, dateKey: string): Promise<TeachingClass[]> {
  await dbConnect();
  const classrooms: any[] = await Classroom.find({
    ...coachClassroomQuery(userId),
    isSessionInstance: { $ne: true },
    isActive: { $ne: false },
    isTestClassroom: { $ne: true },
  })
    .select("title coach instructor students generatedSessions isActive status isPaused pausedFrom completedAt")
    .lean();
  return flattenScheduledSessions(classrooms)
    .filter(({ classroom, session, start }) => {
      if (!Types.ObjectId.isValid(String(session?._id || ""))) return false;
      if (academyDateKey(start) !== dateKey) return false;
      if (session.actualStartedAt || session.actualEndedAt) return false;
      if (session.status && session.status !== "scheduled") return false;
      if (isSessionOffSchedule(classroom, session)) return false;
      return effectiveCoachId(session, classroom) === String(userId);
    })
    .map(({ classroom, session, start, end }) => ({
      classroom: idOf(classroom._id),
      sessionId: idOf(session._id),
      title: String(classroom.title || session.topicName || "Class"),
      start,
      end,
      studentCount: (Array.isArray(session.students) && session.students.length ? session.students : classroom.students || []).length,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Keeps every class already on the leave and adds any scheduled since. */
function mergeSessions(existing: any[], fresh: TeachingClass[]) {
  const seen = new Set(existing.map((session) => leaveSessionKey(session.classroom, session.sessionId)));
  const added = fresh.filter((session) => !seen.has(leaveSessionKey(session.classroom, session.sessionId)));
  return { sessions: [...existing, ...added].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), added: added.length };
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export type LeaveCreditState = { limited: boolean; balance: number; held: number; available: number };

async function pendingCosts(userId: string) {
  const pending: any[] = await LeaveRequest.find({ applicant: userId, status: "requested" }).select("creditCost").lean();
  return pending.map((leave) => Number(leave.creditCost || 0));
}

export async function getCreditState(userId: string): Promise<LeaveCreditState> {
  await dbConnect();
  const account: any = await LeaveCreditAccount.findOne({ user: userId }).lean();
  if (!account) return { limited: false, balance: 0, held: 0, available: 0 };
  const { held, available } = availableCredits(account.balance, await pendingCosts(userId));
  return { limited: true, balance: Number(account.balance || 0), held, available };
}

function creditLine(state: LeaveCreditState | null) {
  if (!state) return "";
  return state.limited ? `Leave credits: ${formatCredits(state.balance)} left.` : "No leave credit limit.";
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export async function applyForLeave(viewer: LeaveViewer, raw: unknown, now = new Date()) {
  if (!viewer.canApply) throw new LeaveError("You cannot apply for leave.", 403);
  const input = applyLeaveSchema.parse(raw);
  const dateKey = input.date;
  if (dateKey < academyDateKey(now)) throw new LeaveError("Choose today or a later date.");
  if (dateKey > academyDateKey(new Date(now.getTime() + MAX_LEAVE_DAYS_AHEAD * DAY_MS))) {
    throw new LeaveError(`Leave can be applied for at most ${MAX_LEAVE_DAYS_AHEAD} days ahead.`);
  }
  await dbConnect();

  const classes = await teachingClassesOn(viewer.id, dateKey);
  let sessions: TeachingClass[] = [];
  if (input.type === "full_day") {
    sessions = classes;
  } else if (classes.length) {
    const chosen = Array.from(new Set(input.sessionIds));
    if (!chosen.length) throw new LeaveError(`Choose the class${MAX_HALF_DAY_CLASSES > 1 ? "es" : ""} you will miss (at most ${MAX_HALF_DAY_CLASSES}).`);
    if (chosen.length > MAX_HALF_DAY_CLASSES) throw new LeaveError(`A half day covers at most ${MAX_HALF_DAY_CLASSES} classes. Apply for a full day instead.`);
    const byId = new Map(classes.map((item) => [item.sessionId, item]));
    sessions = chosen.map((id) => byId.get(id)).filter(Boolean) as TeachingClass[];
    if (sessions.length !== chosen.length) throw new LeaveError("One of the chosen classes is no longer on your schedule for that day. Refresh and choose again.");
  } else if (input.sessionIds.length) {
    throw new LeaveError("Those classes are no longer on your schedule for that day. Refresh and choose again.");
  }

  const notice = noticeError({ type: input.type, dateKey, sessions }, now);
  if (notice) throw new LeaveError(notice);

  const cost = creditCost(input.type);
  const account: any = await LeaveCreditAccount.findOne({ user: viewer.id }).lean();
  const creditError = creditCheckError(account ? { balance: Number(account.balance || 0) } : null, await pendingCosts(viewer.id), cost);
  if (creditError) throw new LeaveError(creditError);

  const applicant: any = await User.findById(viewer.id).select("name username role").lean();
  if (!applicant) throw new LeaveError("Your account was not found.", 404);
  const leave: any = await LeaveRequest.create({
    applicant: viewer.id,
    applicantName: applicant.name || applicant.username || "Staff member",
    applicantRole: applicant.role === "instructor" ? "instructor" : "sub-admin",
    type: input.type,
    dateKey,
    startsAt: leaveStartsAt({ type: input.type, dateKey, sessions }),
    sessions,
    reason: input.reason,
    creditCost: cost,
  });
  await announceRequest(leave, await getCreditState(viewer.id)).catch((error) => console.error("[leave] request notices failed", error));
  return serializeLeave(leave);
}

// ---------------------------------------------------------------------------
// Decide / cancel
// ---------------------------------------------------------------------------

export async function applyLeaveAction(id: string, raw: unknown, viewer: LeaveViewer, now = new Date()) {
  validId(id);
  const input = leaveActionSchema.parse(raw);
  if (input.action === "cancel") return cancelLeave(id, input.reason, viewer, now);
  if (!viewer.isApprover) throw new LeaveError("Only admins and leave approvers can approve or reject leave.", 403);
  await dbConnect();
  const existing: any = await LeaveRequest.findById(id).lean();
  if (!existing) throw new LeaveError("Leave request not found.", 404);
  if (idOf(existing.applicant) === viewer.id) throw new LeaveError("You cannot approve or reject your own leave.", 403);
  if (existing.status !== "requested") throw new LeaveError(`This leave has already been ${existing.status}.`, 409);
  if (existing.dateKey < academyDateKey(now)) throw new LeaveError("This leave day has already passed.", 409);
  const decided = { decidedBy: viewer.id, decidedByName: viewer.name || "Admin", decidedAt: now };

  if (input.action === "reject") {
    const leave: any = await LeaveRequest.findOneAndUpdate(
      { _id: id, status: "requested" },
      { $set: { ...decided, status: "rejected", rejectionReason: input.reason } },
      { new: true }
    ).lean();
    if (!leave) throw new LeaveError("Someone else has just decided on this leave. Refresh to see it.", 409);
    await announceDecision(leave, viewer, null).catch((error) => console.error("[leave] decision notices failed", error));
    return serializeLeave(leave);
  }

  // A full day takes the applicant's whole day as it stands now, including
  // classes scheduled after they applied.
  const sessions = existing.type === "full_day"
    ? mergeSessions(existing.sessions || [], await teachingClassesOn(idOf(existing.applicant), existing.dateKey)).sessions
    : existing.sessions || [];
  let leave: any = await LeaveRequest.findOneAndUpdate(
    { _id: id, status: "requested" },
    { $set: { ...decided, status: "approved", sessions, creditCharged: 0 } },
    { new: true }
  ).lean();
  if (!leave) throw new LeaveError("Someone else has just decided on this leave. Refresh to see it.", 409);

  const applicantId = idOf(leave.applicant);
  const account: any = await LeaveCreditAccount.findOne({ user: applicantId }).lean();
  if (account) {
    const cost = Number(leave.creditCost || 0);
    const charged: any = await LeaveCreditAccount.findOneAndUpdate(
      { user: applicantId, balance: { $gte: cost } },
      { $inc: { balance: -cost } },
      { new: true }
    ).lean();
    if (!charged) {
      // Put the request back exactly as it was: nothing was charged.
      await LeaveRequest.updateOne({ _id: id, status: "approved" }, { $set: { status: "requested" }, $unset: { decidedBy: 1, decidedByName: 1, decidedAt: 1 } });
      throw new LeaveError(`${leave.applicantName} has only ${formatCredits(account.balance)} leave credit(s) left and this leave needs ${formatCredits(cost)}. Add credits or reject it.`, 409);
    }
    leave = await LeaveRequest.findOneAndUpdate({ _id: id }, { $set: { creditCharged: cost } }, { new: true }).lean();
    await LeaveCreditEntry.create({
      user: applicantId, type: "deduction", amount: -cost, balanceAfter: charged.balance, leaveRequest: id,
      by: viewer.id, byName: viewer.name, note: `${leaveTypeLabel(leave.type)} leave on ${leave.dateKey} approved`,
    });
  }

  const credits = await getCreditState(applicantId);
  await announceDecision(leave, viewer, credits).catch((error) => console.error("[leave] decision notices failed", error));
  if (leave.sessions?.length) {
    await raiseLeaveSubstitutionTask(leave);
    await announceSubstitution(leave).catch((error) => console.error("[leave] substitution notices failed", error));
    // Some classes may already have a substitute; settle what is covered now.
    await syncLeaveCoverage({ leaveId: id }, now);
  }
  const fresh: any = await LeaveRequest.findById(id).lean();
  return serializeLeave(fresh || leave, (await coverageFor([fresh || leave])).get(id));
}

async function cancelLeave(id: string, reason: string, viewer: LeaveViewer, now: Date) {
  await dbConnect();
  const existing: any = await LeaveRequest.findById(id).lean();
  if (!existing) throw new LeaveError("Leave request not found.", 404);
  const own = idOf(existing.applicant) === viewer.id;
  const blocked = cancelBlockReason(existing, viewer, now);
  if (blocked) throw new LeaveError(blocked, !own && !viewer.isApprover ? 403 : 409);
  const leave: any = await LeaveRequest.findOneAndUpdate(
    { _id: id, status: existing.status },
    { $set: { status: "cancelled", cancelledBy: viewer.id, cancelledAt: now, cancelReason: reason || "" } },
    { new: true }
  ).lean();
  if (!leave) throw new LeaveError("This leave changed while you were cancelling it. Refresh to see it.", 409);

  const charged = Number(leave.creditCharged || 0);
  if (charged > 0) {
    // A limit removed since approval has nothing to refund into.
    const account: any = await LeaveCreditAccount.findOneAndUpdate({ user: leave.applicant }, { $inc: { balance: charged } }, { new: true }).lean();
    if (account) {
      await LeaveCreditEntry.create({
        user: leave.applicant, type: "refund", amount: charged, balanceAfter: account.balance, leaveRequest: id,
        by: viewer.id, byName: viewer.name, note: `${leaveTypeLabel(leave.type)} leave on ${leave.dateKey} cancelled`,
      });
    }
  }
  await cancelLeaveSubstitutionTask(id, "Leave cancelled.");
  await announceClosed(leave, own ? "cancelled by the applicant" : `cancelled by ${viewer.name || "an admin"}`, viewer.id, existing.status === "approved")
    .catch((error) => console.error("[leave] cancel notices failed", error));
  return serializeLeave(leave);
}

// ---------------------------------------------------------------------------
// Substitute coverage
// ---------------------------------------------------------------------------

/** For each leave, whether each of its classes still needs a substitute. */
export async function coverageFor(leaves: any[]): Promise<Map<string, LeaveCoverage>> {
  const result = new Map<string, LeaveCoverage>();
  const classroomIds = Array.from(new Set(leaves.flatMap((leave) => (leave.sessions || []).map((session: any) => idOf(session.classroom)))))
    .filter((id) => Types.ObjectId.isValid(id));
  if (!classroomIds.length) return result;
  await dbConnect();
  const classrooms: any[] = await Classroom.find({ _id: { $in: classroomIds } })
    .select("coach instructor generatedSessions._id generatedSessions.substituteCoach generatedSessions.assignedCoach generatedSessions.status generatedSessions.scheduledFor generatedSessions.startTime generatedSessions.durationMinutes")
    .populate("generatedSessions.substituteCoach", "name username")
    .lean();
  const byId = new Map(classrooms.map((classroom) => [idOf(classroom._id), classroom]));
  for (const leave of leaves) {
    const coverage: LeaveCoverage = {};
    for (const session of leave.sessions || []) {
      const classroom = byId.get(idOf(session.classroom));
      const live = (classroom?.generatedSessions || []).find((item: any) => idOf(item._id) === String(session.sessionId));
      const covered = isSessionCovered(live, classroom, idOf(leave.applicant), leave.dateKey);
      const substitute = live?.substituteCoach && idOf(live.substituteCoach) !== idOf(leave.applicant) ? live.substituteCoach : null;
      coverage[leaveSessionKey(session.classroom, session.sessionId)] = { covered, substituteName: substitute ? substitute.name || substitute.username || "Substitute" : null };
    }
    result.set(idOf(leave._id), coverage);
  }
  return result;
}

/**
 * Re-checks approved leaves that still have classes without cover: adds
 * classes scheduled onto a full day since approval, settles the substitution
 * task once nothing is left to cover (or the classes have gone by), and
 * re-raises it if it went missing. Called after any classroom change that can
 * cover a class, and hourly by the sweep.
 */
export async function syncLeaveCoverage(scope: { classroomId?: string; leaveId?: string } = {}, now = new Date()) {
  await dbConnect();
  const query: any = { status: "approved", coveredAt: null, dateKey: { $gte: academyDateKey(new Date(now.getTime() - DAY_MS)) } };
  if (scope.leaveId) query._id = scope.leaveId;
  if (scope.classroomId) query["sessions.classroom"] = scope.classroomId;
  const leaves: any[] = await LeaveRequest.find(query).lean();
  let settled = 0;
  for (const leave of leaves) {
    try {
      let sessions: any[] = leave.sessions || [];
      let added = 0;
      if (leave.type === "full_day" && academyDateKey(now) <= leave.dateKey) {
        const merged = mergeSessions(sessions, await teachingClassesOn(idOf(leave.applicant), leave.dateKey));
        if (merged.added) {
          sessions = merged.sessions;
          added = merged.added;
          await LeaveRequest.updateOne({ _id: leave._id, status: "approved" }, { $set: { sessions } });
        }
      }
      if (!sessions.length) continue;
      const current = { ...leave, sessions };
      const coverage = (await coverageFor([current])).get(idOf(leave._id)) || {};
      const outstanding = sessions.filter((session) => !coverage[leaveSessionKey(session.classroom, session.sessionId)]?.covered && new Date(session.end || session.start).getTime() > now.getTime());
      if (!outstanding.length) {
        const allCovered = sessions.every((session) => coverage[leaveSessionKey(session.classroom, session.sessionId)]?.covered);
        await LeaveRequest.updateOne({ _id: leave._id, coveredAt: null }, { $set: { coveredAt: now } });
        await resolveLeaveSubstitutionTask(leave._id, undefined, allCovered ? "Every class on the leave is covered." : "The classes on this leave have gone by.");
        settled += 1;
      } else {
        await raiseLeaveSubstitutionTask(current, { reopen: added > 0 });
      }
    } catch (error) {
      console.error("[leave] coverage sync failed", { leave: idOf(leave._id), error });
    }
  }
  return { checked: leaves.length, settled };
}

/** Fire-and-forget hook for the classroom API after a substitute, cancel or reschedule. */
export function syncLeaveCoverageForClassroom(classroomId: unknown) {
  const id = idOf(classroomId);
  if (!Types.ObjectId.isValid(id)) return;
  void syncLeaveCoverage({ classroomId: id }).catch((error) => console.error("[leave] coverage hook failed", error));
}

// ---------------------------------------------------------------------------
// Sweep, lists, summary
// ---------------------------------------------------------------------------

/** Hourly: close requests nobody decided before their day ended, then re-check cover. */
export async function processLeaveSweep(now = new Date()) {
  await dbConnect();
  const todayKey = academyDateKey(now);
  const stale: any[] = await LeaveRequest.find({ status: "requested", dateKey: { $lt: todayKey } }).select("_id").lean();
  let expired = 0;
  for (const { _id } of stale) {
    const leave: any = await LeaveRequest.findOneAndUpdate({ _id, status: "requested" }, { $set: { status: "expired" } }, { new: true }).lean();
    if (!leave) continue;
    expired += 1;
    await announceExpired(leave).catch((error) => console.error("[leave] expiry notices failed", error));
  }
  const coverage = await syncLeaveCoverage({}, now);
  return { expired, ...coverage };
}

export async function listLeaves(viewer: LeaveViewer, now = new Date()) {
  await dbConnect();
  const todayKey = academyDateKey(now);
  const mine: any[] = viewer.canApply
    ? await LeaveRequest.find({ applicant: viewer.id }).sort({ dateKey: -1, createdAt: -1 }).limit(100).lean()
    : [];
  const all: any[] = viewer.isApprover
    ? await LeaveRequest.find({
        $or: [{ status: "requested" }, { dateKey: { $gte: todayKey } }, { createdAt: { $gte: new Date(now.getTime() - 120 * DAY_MS) } }],
      }).sort({ dateKey: 1, createdAt: 1 }).limit(500).lean()
    : [];
  const yesterdayKey = academyDateKey(new Date(now.getTime() - DAY_MS));
  const needsCoverage = [...mine, ...all].filter((leave) => leave.status === "approved" && leave.dateKey >= yesterdayKey && leave.sessions?.length);
  const coverage = await coverageFor(needsCoverage);
  const serialize = (leave: any) => serializeLeave(leave, coverage.get(idOf(leave._id)));
  return {
    mine: mine.map(serialize),
    leaves: all.map(serialize),
    credits: viewer.canApply ? await getCreditState(viewer.id) : null,
    rules: { fullDayNoticeHours: FULL_DAY_NOTICE_HOURS, halfDayNoticeHours: halfDayNoticeHours(), maxHalfDayClasses: MAX_HALF_DAY_CLASSES, maxDaysAhead: MAX_LEAVE_DAYS_AHEAD },
    today: todayKey,
  };
}

export async function getLeaveSummary(viewer: LeaveViewer) {
  await dbConnect();
  const pendingCount = viewer.isApprover ? await LeaveRequest.countDocuments({ status: "requested", applicant: { $ne: viewer.id } }) : 0;
  return { pendingCount };
}

// ---------------------------------------------------------------------------
// Credit administration (admins only)
// ---------------------------------------------------------------------------

async function marketingRoleIds() {
  const roles: any[] = await AccessRole.find({ nameKey: MARKETING_ACCESS_ROLE_NAME_KEY }).select("_id").lean();
  return roles.map((role) => role._id);
}

async function eligibleStaff(userId?: string) {
  const excluded = await marketingRoleIds();
  const query: any = { role: { $in: ["instructor", "sub-admin"] }, isActive: { $ne: false }, accessRole: { $nin: excluded } };
  if (userId) query._id = userId;
  return User.find(query).select("_id name username email role").sort({ name: 1 }).lean() as Promise<any[]>;
}

export async function listCreditAccounts(viewer: LeaveViewer) {
  if (!viewer.canManageCredits) throw new LeaveError("Only admins manage leave credits.", 403);
  await dbConnect();
  const staff = await eligibleStaff();
  const ids = staff.map((user) => user._id);
  const [accounts, pending] = await Promise.all([
    LeaveCreditAccount.find({ user: { $in: ids } }).lean() as Promise<any[]>,
    LeaveRequest.find({ status: "requested", applicant: { $in: ids } }).select("applicant creditCost").lean() as Promise<any[]>,
  ]);
  const accountBy = new Map(accounts.map((account) => [idOf(account.user), account]));
  return {
    staff: staff.map((user) => {
      const account = accountBy.get(idOf(user._id));
      const held = pending.filter((leave) => idOf(leave.applicant) === idOf(user._id)).reduce((sum, leave) => sum + Number(leave.creditCost || 0), 0);
      return {
        userId: idOf(user._id),
        name: user.name || user.username || "Staff member",
        email: user.email || "",
        role: user.role,
        limited: Boolean(account),
        balance: account ? Number(account.balance || 0) : null,
        totalGranted: account ? Number(account.totalGranted || 0) : null,
        held,
      };
    }),
  };
}

export async function creditLedger(viewer: LeaveViewer, userId: string) {
  if (!viewer.canManageCredits && viewer.id !== userId) throw new LeaveError("You cannot see these credits.", 403);
  validId(userId, "Staff member");
  await dbConnect();
  const entries: any[] = await LeaveCreditEntry.find({ user: userId }).sort({ createdAt: -1 }).limit(100).lean();
  return {
    entries: entries.map((entry) => ({
      _id: idOf(entry._id),
      type: entry.type,
      amount: Number(entry.amount || 0),
      balanceAfter: entry.balanceAfter ?? null,
      byName: entry.byName || "",
      note: entry.note || "",
      leaveRequest: entry.leaveRequest ? idOf(entry.leaveRequest) : null,
      createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
    })),
  };
}

export async function applyCreditAction(viewer: LeaveViewer, raw: unknown) {
  if (!viewer.canManageCredits) throw new LeaveError("Only admins manage leave credits.", 403);
  const input = leaveCreditActionSchema.parse(raw);
  await dbConnect();
  const [target] = await eligibleStaff(input.userId);
  if (!target) throw new LeaveError("Leave credits can be given to active coaches and sub-admins only (not marketing staff).", 404);
  const recipient = await leaveUserRecipient(target._id);

  if (input.action === "remove_limit") {
    const removed = await LeaveCreditAccount.findOneAndDelete({ user: target._id }).lean();
    if (!removed) throw new LeaveError(`${target.name} has no credit limit.`, 409);
    await LeaveCreditEntry.create({ user: target._id, type: "limit_removed", amount: 0, balanceAfter: null, by: viewer.id, byName: viewer.name, note: input.note || "Credit limit removed" });
    if (recipient) {
      await notifyLeave([recipient], {
        dedupKey: `leave_credits:${idOf(target._id)}:${Date.now()}`, title: "Leave credit limit removed", href: LEAVE_HREF, leaveId: "", event: "credits_limit_removed",
        message: () => `${viewer.name || "An admin"} removed the credit limit on your leave. You can apply for leave without using credits.`,
        channels: { inApp: true, email: true },
      }).catch((error) => console.error("[leave] credit notice failed", error));
    }
    return { ok: true };
  }

  const amount = input.amount;
  const account: any = amount > 0
    ? await LeaveCreditAccount.findOneAndUpdate(
        { user: target._id },
        { $inc: { balance: amount, totalGranted: amount } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean()
    : await LeaveCreditAccount.findOneAndUpdate({ user: target._id, balance: { $gte: -amount } }, { $inc: { balance: amount } }, { new: true }).lean();
  if (!account) {
    const current: any = await LeaveCreditAccount.findOne({ user: target._id }).lean();
    throw new LeaveError(current
      ? `${target.name} has only ${formatCredits(current.balance)} credit(s); the balance cannot go below 0.`
      : `${target.name} has no credit limit yet. Give credits first.`, 409);
  }
  await LeaveCreditEntry.create({
    user: target._id, type: amount > 0 ? "grant" : "adjustment", amount, balanceAfter: account.balance,
    by: viewer.id, byName: viewer.name, note: input.note || "",
  });
  if (recipient) {
    const change = `${amount > 0 ? "+" : ""}${formatCredits(amount)}`;
    await notifyLeave([recipient], {
      dedupKey: `leave_credits:${idOf(target._id)}:${idOf(account._id)}:${account.updatedAt ? new Date(account.updatedAt).getTime() : Date.now()}`,
      title: "Leave credits updated", href: LEAVE_HREF, leaveId: "", event: "credits_updated",
      message: () => `${viewer.name || "An admin"} updated your leave credits (${change}). Balance: ${formatCredits(account.balance)}.${input.note ? ` Note: ${input.note}` : ""}`,
      channels: { inApp: true, email: true, whatsapp: true },
      templateName: "leave_credits_updated",
      bodyParameters: (r) => [r.name || "there", viewer.name || "Admin", change, formatCredits(account.balance)],
    }).catch((error) => console.error("[leave] credit notice failed", error));
  }
  return { ok: true, balance: Number(account.balance || 0) };
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

function classesLine(leave: any) {
  return leave.sessions?.length ? `Classes: ${describeLeaveSessions(leave.sessions)}.` : "";
}

/** Named approvers on every channel; other admins in-app; the applicant gets a receipt. */
async function announceRequest(leave: any, credits: LeaveCreditState) {
  const applicantId = idOf(leave.applicant);
  const day = leaveDayLabel(leave.dateKey);
  const type = lowerType(leave.type);
  const [named, admins, applicant] = await Promise.all([namedApproverRecipients(applicantId), adminRecipients(applicantId), leaveUserRecipient(applicantId)]);
  const namedIds = new Set(named.map((r) => r.userId).filter(Boolean));
  const base = {
    href: hrefFor(leave), leaveId: idOf(leave), event: "requested",
    title: `Leave request: ${leave.applicantName} (${leaveTypeLabel(leave.type)}, ${day})`,
    message: () => [`${leave.applicantName} has applied for ${type} leave on ${day}.`, classesLine(leave), `Reason: ${leave.reason}`, creditLine(credits), "Please approve or reject it on the Leave page."].filter(Boolean).join("\n"),
    dedupKey: `leave:${idOf(leave)}:requested`,
  };
  await notifyLeave(named, {
    ...base, channels: { inApp: true, email: true, whatsapp: true }, templateName: "leave_request_approver_alert",
    bodyParameters: (r) => [r.name || "there", leave.applicantName, type, day, leave.sessions?.length ? describeLeaveSessions(leave.sessions) : "None", leave.reason],
  });
  await notifyLeave(admins.filter((r) => !namedIds.has(r.userId)), { ...base, channels: { inApp: true } });
  if (applicant) {
    await notifyLeave([applicant], {
      href: hrefFor(leave), leaveId: idOf(leave), event: "received", dedupKey: `leave:${idOf(leave)}:received`,
      title: `Leave request received (${day})`,
      message: () => [`Your ${type} leave request for ${day} has been received and is waiting for approval.`, classesLine(leave), "You will be told as soon as it is reviewed."].filter(Boolean).join("\n"),
      channels: { email: true, whatsapp: true }, templateName: "leave_request_received_applicant",
      bodyParameters: (r) => [r.name || "there", type, day],
    });
  }
}

/** The applicant hears the decision; the deciding approver gets a confirmation; the other approvers see it in-app. */
async function announceDecision(leave: any, approver: LeaveViewer, credits: LeaveCreditState | null) {
  const applicantId = idOf(leave.applicant);
  const day = leaveDayLabel(leave.dateKey);
  const type = lowerType(leave.type);
  const approved = leave.status === "approved";
  const verdict = approved ? "approved" : "rejected";
  const detail = approved
    ? [classesLine(leave) && "The academy will arrange substitutes for your classes.", credits?.limited ? `Leave credits left: ${formatCredits(credits.balance)}.` : ""].filter(Boolean).join(" ") || "Enjoy your time off."
    : `Reason: ${leave.rejectionReason}`;
  const [applicant, self, approvers] = await Promise.all([leaveUserRecipient(applicantId), leaveUserRecipient(approver.id), approverRecipients(applicantId)]);
  if (applicant) {
    await notifyLeave([applicant], {
      href: hrefFor(leave), leaveId: idOf(leave), event: verdict, dedupKey: `leave:${idOf(leave)}:${verdict}`,
      title: `Your leave on ${day} was ${verdict}`,
      message: () => [`Your ${type} leave on ${day} has been ${verdict} by ${approver.name || "an admin"}.`, detail].join("\n"),
      channels: { inApp: true, email: true, whatsapp: true }, templateName: "leave_request_decision_applicant",
      bodyParameters: (r) => [r.name || "there", type, day, verdict, approver.name || "an admin", detail],
    });
  }
  if (self) {
    await notifyLeave([self], {
      href: hrefFor(leave), leaveId: idOf(leave), event: `${verdict}_confirmation`, dedupKey: `leave:${idOf(leave)}:${verdict}:confirmation`,
      title: `You ${verdict} ${leave.applicantName}'s leave (${day})`,
      message: () => [`You have ${verdict} the ${type} leave of ${leave.applicantName} for ${day}.`, approved && leave.sessions?.length ? "A task to arrange substitutes has been added to Tasks." : ""].filter(Boolean).join("\n"),
      channels: { email: true, whatsapp: true }, templateName: "leave_decision_approver_confirmation",
      bodyParameters: (r) => [r.name || "there", verdict, type, leave.applicantName, day],
    });
  }
  await notifyLeave(approvers.filter((r) => r.userId !== approver.id), {
    href: hrefFor(leave), leaveId: idOf(leave), event: `${verdict}_fyi`, dedupKey: `leave:${idOf(leave)}:${verdict}:fyi`,
    title: `Leave ${verdict}: ${leave.applicantName} (${day})`,
    message: () => `${approver.name || "An approver"} ${verdict} the ${type} leave of ${leave.applicantName} for ${day}.`,
    channels: { inApp: true },
  });
}

/** Admins and named approvers: an approved coach leave needs substitutes. */
async function announceSubstitution(leave: any) {
  const recipients = await approverRecipients(idOf(leave.applicant));
  const day = leaveDayLabel(leave.dateKey);
  const classes = describeLeaveSessions(leave.sessions || []);
  await notifyLeave(recipients, {
    href: hrefFor(leave), leaveId: idOf(leave), event: "substitution_needed", dedupKey: `leave:${idOf(leave)}:substitution`,
    title: `Arrange substitutes: ${leave.applicantName} on leave ${day}`,
    message: () => [
      `${leave.applicantName}'s ${lowerType(leave.type)} leave on ${day} is approved.`,
      `Classes needing a substitute: ${classes}.`,
      "Assign a substitute on each classroom; the task in Tasks closes on its own once every class is covered.",
    ].join("\n"),
    channels: { inApp: true, email: true, whatsapp: true }, templateName: "leave_substitution_admin_alert",
    bodyParameters: (r) => [r.name || "there", leave.applicantName, lowerType(leave.type), day, classes],
  });
}

/** A cancelled leave: approvers hear of it; the applicant too when someone else cancelled it. */
async function announceClosed(leave: any, how: string, actorId: string, wasApproved: boolean) {
  const applicantId = idOf(leave.applicant);
  const day = leaveDayLabel(leave.dateKey);
  const type = lowerType(leave.type);
  const detail = wasApproved && leave.sessions?.length
    ? "Substitutes already assigned stay in place; change them on the classroom if the coach will now teach."
    : leave.cancelReason ? `Reason: ${leave.cancelReason}` : "No action is needed.";
  const [named, admins, applicant] = await Promise.all([namedApproverRecipients(applicantId), adminRecipients(applicantId), leaveUserRecipient(applicantId)]);
  const namedIds = new Set(named.map((r) => r.userId).filter(Boolean));
  const base = {
    href: hrefFor(leave), leaveId: idOf(leave), event: "cancelled", dedupKey: `leave:${idOf(leave)}:cancelled`,
    title: `Leave cancelled: ${leave.applicantName} (${day})`,
    message: () => `The ${type} leave of ${leave.applicantName} for ${day} has been ${how}.\n${detail}`,
    templateName: "leave_cancelled_alert",
    bodyParameters: (r: LeaveRecipient) => [r.name || "there", type, leave.applicantName, day, how, detail],
  };
  await notifyLeave(named.filter((r) => r.userId !== actorId), { ...base, channels: { inApp: true, email: true, whatsapp: true } });
  await notifyLeave(admins.filter((r) => !namedIds.has(r.userId) && r.userId !== actorId), { ...base, channels: { inApp: true } });
  if (applicant && applicantId !== actorId) {
    await notifyLeave([applicant], { ...base, channels: { inApp: true, email: true, whatsapp: true } });
  }
}

/** A request nobody decided on before its day ended. */
async function announceExpired(leave: any) {
  const applicantId = idOf(leave.applicant);
  const day = leaveDayLabel(leave.dateKey);
  const type = lowerType(leave.type);
  const [applicant, named] = await Promise.all([leaveUserRecipient(applicantId), namedApproverRecipients(applicantId)]);
  if (applicant) {
    const detail = "It was not reviewed before the leave day ended. Please speak to an admin.";
    await notifyLeave([applicant], {
      href: hrefFor(leave), leaveId: idOf(leave), event: "expired", dedupKey: `leave:${idOf(leave)}:expired`,
      title: `Leave request for ${day} closed`,
      message: () => `Your ${type} leave request for ${day} was closed without a decision.\n${detail}`,
      channels: { inApp: true, email: true, whatsapp: true }, templateName: "leave_request_decision_applicant",
      bodyParameters: (r) => [r.name || "there", type, day, "closed", "the portal", detail],
    });
  }
  await notifyLeave(named, {
    href: hrefFor(leave), leaveId: idOf(leave), event: "expired", dedupKey: `leave:${idOf(leave)}:expired:approvers`,
    title: `Leave request closed undecided: ${leave.applicantName} (${day})`,
    message: () => `The ${type} leave request of ${leave.applicantName} for ${day} was never approved or rejected, and has been closed.`,
    channels: { inApp: true, email: true, whatsapp: true }, templateName: "leave_cancelled_alert",
    bodyParameters: (r) => [r.name || "there", type, leave.applicantName, day, "closed without a decision", "Please follow up with them if needed."],
  });
}
