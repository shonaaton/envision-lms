import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

// Opt-in only, restricted to the disposable fixture written by the local runner.
// PTM_VERIFY_LOCAL=1 npx vitest run src/lib/ptm
describe.skipIf(process.env.PTM_VERIFY_LOCAL !== "1")("PTM service on disposable Mongo", () => {
  let service: typeof import("./ptmService");
  let Ptm: any, User: any, StudentPause: any, Classroom: any, InternalTask: any;
  let student: any, coach: any, staff: any, users: any;
  const preferredAt = new Date(Date.now() + 2 * 86400_000);
  const request = () => ({ coach: users.coach, preferredAt, reason: "Discuss progress and practice habits" });
  beforeAll(async () => {
    const fixture = JSON.parse(readFileSync(resolve("../../outputs/ptm-verification/fixtures.json"), "utf8"));
    if (fixture.database !== "ptm_disposable" || !/^mongodb:\/\/127\.0\.0\.1:/.test(fixture.uri)) throw new Error("Only disposable local PTM fixtures allowed");
    process.env.MONGODB_URI = fixture.uri; process.env.MONGODB_DB = fixture.database;
    process.env.EMAIL_AUTOMATION_WEBHOOK_URL = "http://127.0.0.1:3013/email";
    service = await import("./ptmService");
    ({ Ptm } = await import("@/models/Ptm")); ({ User } = await import("@/models/User"));
    ({ StudentPause } = await import("@/models/StudentPause")); ({ Classroom } = await import("@/models/Classroom")); ({ InternalTask } = await import("@/models/InternalTask"));
    const { dbConnect } = await import("@/lib/db"); await dbConnect(); await Ptm.init();
    users = fixture.users;
    const suffix = new mongoose.Types.ObjectId().toString();
    const person = await User.create({ name: "PTM Service Test Student", username: `ptm-service-${suffix}`, email: `ptm-service-${suffix}@example.test`, passwordHash: "unused-test-only", role: "student", accountStatus: "enrolled", isActive: true, batches: [] });
    student = { id: String(person._id), role: "student", canCreate: true };
    coach = { id: users.coach, role: "instructor", canApprove: true };
    staff = { id: users.subadmin, role: "sub-admin", canApprove: true, canEdit: true };
    await Classroom.updateOne({ _id: fixture.classroom }, { $addToSet: { students: student.id } });
  });
  afterAll(async () => { await mongoose.disconnect(); });
  it("serializes concurrent requests, enforces ownership and returns credits on reject/cancel", async () => {
    const results = await Promise.allSettled([service.requestPtm(student, request()), service.requestPtm(student, request())]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const p = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<any>).value;
    expect((await service.getCreditSummary(student.id)).held).toBe(1);
    await expect(service.applyPtmAction(p._id, { action: "approve" }, { ...coach, id: users.othercoach })).rejects.toMatchObject({ status: 403 });
    await expect(service.requestPtm(student, request())).rejects.toMatchObject({ status: 409 });
    await service.applyPtmAction(p._id, { action: "reject", rejectionReason: "Please choose another slot" }, coach);
    expect((await service.getCreditSummary(student.id)).remaining).toBe(12);
    const next = await service.requestPtm(student, request()); await service.applyPtmAction(next._id, { action: "approve" }, coach);
    await service.applyPtmAction(next._id, { action: "cancel", cancelReason: "Family unavailable" }, student);
    expect((await service.getCreditSummary(student.id)).remaining).toBe(12);
    expect(await InternalTask.countDocuments({ referenceId: next._id, status: { $in: ["pending", "in_progress"] } })).toBe(0);
  });
  it("rejects demos, active pauses, unrelated coaches and past preferences", async () => {
    await User.updateOne({ _id: student.id }, { $set: { accountStatus: "demo" } });
    await expect(service.requestPtm(student, request())).rejects.toMatchObject({ status: 403 });
    await User.updateOne({ _id: student.id }, { $set: { accountStatus: "enrolled" } });
    const pause = await StudentPause.create({ student: student.id, status: "active", pausedFrom: new Date(), pausedUntil: preferredAt });
    await expect(service.requestPtm(student, request())).rejects.toThrow("paused");
    await StudentPause.updateOne({ _id: pause._id }, { $set: { status: "cancelled" } });
    await expect(service.requestPtm(student, { ...request(), coach: users.othercoach })).rejects.toThrow("running classrooms");
    await expect(service.requestPtm(student, { ...request(), preferredAt: new Date(0) })).rejects.toThrow("future");
  });
  it("enforces scheduling permissions, spacing, reschedule notifications and spent credit cancellation", async () => {
    const p = await service.requestPtm(student, request());
    const input = { action: "schedule", scheduledAt: preferredAt, durationMinutes: 30, meetingUrl: "meet.google.com/abc-defg-hij" };
    await expect(service.applyPtmAction(p._id, input, coach)).rejects.toMatchObject({ status: 403 });
    await expect(service.applyPtmAction(p._id, input, { ...staff, canEdit: false })).rejects.toMatchObject({ status: 403 });
    await service.applyPtmAction(p._id, input, staff);
    expect(await service.getCreditSummary(student.id)).toMatchObject({ used: 1, held: 0, remaining: 11 });
    await expect(service.applyPtmAction(p._id, { action: "cancel", cancelReason: "Cannot attend" }, student)).rejects.toMatchObject({ status: 403 });
    await expect(service.requestPtm(student, { ...request(), preferredAt: new Date(preferredAt.getTime() + 29 * 86400_000) })).rejects.toThrow("30 days");
    const next = await service.requestPtm(student, { ...request(), preferredAt: new Date(preferredAt.getTime() + 31 * 86400_000) });
    await expect(service.applyPtmAction(next._id, { ...input, scheduledAt: new Date(preferredAt.getTime() + 29 * 86400_000) }, staff)).rejects.toThrow("30 days");
    await expect(service.applyPtmAction(p._id, { ...input, action: "reschedule", scheduledAt: new Date(preferredAt.getTime() + 2 * 86400_000) }, staff)).rejects.toThrow("30 days");
    await service.applyPtmAction(next._id, { action: "cancel", cancelReason: "Test done" }, student);
    await service.applyPtmAction(p._id, { ...input, action: "reschedule", scheduledAt: new Date(preferredAt.getTime() + 86400_000) }, staff);
    await service.applyPtmAction(p._id, { action: "cancel", cancelReason: "Test done" }, staff);
    expect((await service.getCreditSummary(student.id)).remaining).toBe(12);
  });
  it("enforces the 12-credit pool and carries the 30-day gap across October", async () => {
    const { ptmYearOf } = await import("./ptmRules");
    const rows = await Ptm.create(Array.from({ length: 12 }, (_, i) => ({ student: student.id, coach: users.coach, classroom: new mongoose.Types.ObjectId(), studentName: "Pool test", coachName: "Coach", reason: "Pool limit test", ptmYear: ptmYearOf(new Date()), status: "completed", preferredAt: new Date(Date.now() - (400 + i * 31) * 86400_000), scheduledAt: new Date(Date.now() - (400 + i * 31) * 86400_000) })));
    await expect(service.requestPtm(student, request())).rejects.toThrow("all 12");
    await Ptm.updateMany({ _id: { $in: rows.map((p: any) => p._id) } }, { $set: { status: "cancelled" } });
    await Ptm.create({ student: student.id, coach: users.coach, classroom: new mongoose.Types.ObjectId(), reason: "Year boundary meeting", ptmYear: "2025-26", status: "completed", preferredAt: new Date("2026-09-28T10:00:00+05:30"), scheduledAt: new Date("2026-09-28T10:00:00+05:30") });
    expect((await service.getCreditSummary(student.id, new Date("2026-10-01T10:00:00+05:30"))).remaining).toBe(12);
    await expect(service.requestPtm(student, { ...request(), preferredAt: new Date("2026-10-10T10:00:00+05:30") }, new Date("2026-10-01T10:00:00+05:30"))).rejects.toThrow("30 days");
  });
  it("escalates silent coaches after 48h, completes expired meetings and is idempotent", async () => {
    const now = new Date();
    const { ptmYearOf } = await import("./ptmRules");
    const p = await Ptm.create({ student: student.id, coach: users.coach, classroom: new mongoose.Types.ObjectId(), studentName: "Escalation test", coachName: "Coach", reason: "Escalation test request", ptmYear: ptmYearOf(now), status: "requested", preferredAt: new Date(now.getTime() + 60 * 86400_000), createdAt: new Date(now.getTime() - 49 * 3600_000) });
    const past = await Ptm.create({ student: student.id, coach: users.coach, classroom: new mongoose.Types.ObjectId(), reason: "Sweep completed meeting", ptmYear: ptmYearOf(now), status: "scheduled", preferredAt: new Date(now.getTime() - 2 * 3600_000), scheduledAt: new Date(now.getTime() - 2 * 3600_000), durationMinutes: 30 });
    const cancelled = await Ptm.create({ student: student.id, coach: users.coach, classroom: new mongoose.Types.ObjectId(), reason: "Late task race test", studentName: "Late task", coachName: "Coach", ptmYear: ptmYearOf(now), status: "cancelled", preferredAt: now });
    const { raisePtmApprovalTask, raisePtmScheduleTask } = await import("@/lib/tasks/taskTriggers");
    await raisePtmApprovalTask(past); await raisePtmScheduleTask(cancelled);
    await service.processPtmSweep(now); await service.processPtmSweep(now);
    expect(await InternalTask.countDocuments({ referenceType: "PtmSchedule", referenceId: p._id, status: "pending" })).toBe(1);
    expect((await Ptm.findById(past._id)).status).toBe("completed");
    expect((await InternalTask.findOne({ referenceType: "PtmApproval", referenceId: past._id })).status).toBe("completed");
    expect((await InternalTask.findOne({ referenceType: "PtmSchedule", referenceId: cancelled._id })).status).toBe("cancelled");
  });
});
