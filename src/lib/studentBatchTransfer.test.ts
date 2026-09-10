import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classroomFind: vi.fn(),
  batchFindById: vi.fn(),
  batchUpdateOne: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  notify: vi.fn(),
  activity: vi.fn(),
  paused: vi.fn(),
  sync: vi.fn(),
  notifyLeft: vi.fn(),
  notifyJoined: vi.fn(),
  notifyChanged: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/models/Classroom", () => ({ Classroom: { find: mocks.classroomFind } }));
vi.mock("@/models/Batch", () => ({ Batch: { findById: mocks.batchFindById, updateOne: mocks.batchUpdateOne } }));
vi.mock("@/models/User", () => ({ User: { findOne: mocks.userFindOne, updateOne: mocks.userUpdateOne } }));
vi.mock("@/models/Fee", () => ({ Notification: { create: mocks.notify } }));
vi.mock("@/lib/activity", () => ({ recordActivity: mocks.activity }));
vi.mock("@/lib/studentPause", () => ({ pausedStudentIds: mocks.paused }));
vi.mock("@/lib/classroomSessionInstances", () => ({ syncClassroomSessionInstances: mocks.sync }));
vi.mock("@/lib/batchMembershipNotifications", () => ({
  notifyStudentsLeftBatchCoach: mocks.notifyLeft,
  notifyStudentsJoinedBatchCoach: mocks.notifyJoined,
  notifyStudentBatchChanged: mocks.notifyChanged,
}));

import { transferStudentBatch } from "./studentBatchTransfer";

const STUDENT = "aaaaaaaaaaaaaaaaaaaaaaa1";
const CLASSMATE = "aaaaaaaaaaaaaaaaaaaaaaa2";
const OLD_BATCH = "bbbbbbbbbbbbbbbbbbbbbb01";
const NEW_BATCH = "bbbbbbbbbbbbbbbbbbbbbb02";
const ACTOR = "dddddddddddddddddddddd01";

const past = () => new Date(Date.now() - 7 * 24 * 3600 * 1000);
const future = () => new Date(Date.now() + 7 * 24 * 3600 * 1000);

function classroomDoc(id: string, sessions: any[], students: string[] = [STUDENT, CLASSMATE]) {
  return {
    _id: id,
    students,
    studentExits: [],
    generatedSessions: sessions,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

const lean = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });

/** Old-batch classrooms come back on the first find, new-batch ones on the second. */
function withClassrooms(oldOnes: any[], newOnes: any[]) {
  mocks.classroomFind.mockResolvedValueOnce(oldOnes).mockResolvedValueOnce(newOnes);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.paused.mockResolvedValue(new Set());
  mocks.sync.mockResolvedValue(undefined);
  mocks.notify.mockReturnValue({ catch: vi.fn() });
  mocks.activity.mockResolvedValue(undefined);
  mocks.notifyLeft.mockResolvedValue({ sent: 1 });
  mocks.notifyJoined.mockResolvedValue({ sent: 1 });
  mocks.notifyChanged.mockResolvedValue({ sent: 1 });
  mocks.batchUpdateOne.mockResolvedValue({});
  mocks.userUpdateOne.mockResolvedValue({});
  mocks.userFindOne.mockReturnValue(lean({ _id: STUDENT, name: "Riya", batches: [OLD_BATCH], isActive: true }));
  mocks.batchFindById.mockImplementation((id: string) =>
    lean(
      id === OLD_BATCH
        ? { _id: OLD_BATCH, name: "Tue 5pm", studentEnrollments: [] }
        : { _id: NEW_BATCH, name: "Thu 6pm", students: [], studentEnrollments: [] },
    ),
  );
});

const run = () =>
  transferStudentBatch({ studentId: STUDENT, toBatchId: NEW_BATCH, actor: { id: ACTOR, name: "Admin" } });

describe("transferStudentBatch", () => {
  it("records an exit and clears the future without touching the past", async () => {
    const taught = { _id: "s1", scheduledFor: past(), students: [STUDENT, CLASSMATE] };
    const upcoming = { _id: "s2", scheduledFor: future(), students: [STUDENT, CLASSMATE] };
    const leaving = classroomDoc("c1", [taught, upcoming]);
    withClassrooms([leaving], []);

    await run();

    expect(leaving.studentExits).toHaveLength(1);
    expect((leaving.studentExits[0] as any).student.toString()).toBe(STUDENT);
    expect((leaving.studentExits[0] as any).movedToBatch.toString()).toBe(NEW_BATCH);
    // The class they sat keeps them; the one ahead of them does not.
    expect(taught.students).toEqual([STUDENT, CLASSMATE]);
    expect(upcoming.students.map(String)).toEqual([CLASSMATE]);
    expect(leaving.save).toHaveBeenCalled();
  });

  it("leaves them in the classroom roster so their history survives", async () => {
    const leaving = classroomDoc("c1", [{ _id: "s1", scheduledFor: past(), students: [STUDENT] }]);
    withClassrooms([leaving], []);
    await run();
    expect(leaving.students.map(String)).toContain(STUDENT);
  });

  it("drops the old batch and adds the new one on both the batch and the user", async () => {
    withClassrooms([], []);
    await run();

    expect(mocks.batchUpdateOne).toHaveBeenCalledWith(
      { _id: OLD_BATCH },
      expect.objectContaining({ $pull: expect.objectContaining({ students: expect.anything() }) }),
    );
    expect(mocks.batchUpdateOne).toHaveBeenCalledWith(
      { _id: NEW_BATCH },
      expect.objectContaining({ $addToSet: expect.anything() }),
    );
    const userCalls = mocks.userUpdateOne.mock.calls.map((call) => JSON.stringify(call[1]));
    expect(userCalls.some((call) => call.includes("$pull"))).toBe(true);
    expect(userCalls.some((call) => call.includes("$addToSet"))).toBe(true);
  });

  it("adds them to the new batch's upcoming classes but not its finished ones", async () => {
    const alreadyRan = { _id: "n1", scheduledFor: past(), students: [CLASSMATE] };
    const ahead = { _id: "n2", scheduledFor: future(), students: [CLASSMATE] };
    const joining = classroomDoc("c2", [alreadyRan, ahead], [CLASSMATE]);
    withClassrooms([], [joining]);

    await run();

    expect(alreadyRan.students.map(String)).toEqual([CLASSMATE]);
    expect(ahead.students.map(String)).toEqual([CLASSMATE, STUDENT]);
    expect(joining.students.map(String)).toContain(STUDENT);
  });

  it("freezes an inherited past roster so the new arrival is not backdated into it", async () => {
    // No explicit roster: it would otherwise fall back to `classroom.students`,
    // which is about to gain the transferring student.
    const inherited: any = { _id: "n1", scheduledFor: past() };
    const joining = classroomDoc("c2", [inherited], [CLASSMATE]);
    withClassrooms([], [joining]);

    await run();

    expect(inherited.students.map(String)).toEqual([CLASSMATE]);
  });

  it("keeps a paused student off the new batch's registers", async () => {
    mocks.paused.mockResolvedValue(new Set([STUDENT]));
    const ahead = { _id: "n2", scheduledFor: future(), students: [CLASSMATE] };
    const joining = classroomDoc("c2", [ahead], [CLASSMATE]);
    withClassrooms([], [joining]);

    const result = await run();

    expect(result.classroomsJoined).toBe(0);
    expect(ahead.students.map(String)).toEqual([CLASSMATE]);
  });

  it("tells the student, and logs who moved them where", async () => {
    withClassrooms([], []);
    await run();
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ user: STUDENT, type: "batch_changed" }));
    expect(mocks.activity).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        targetUser: STUDENT,
        type: "student.batch.changed",
        metadata: expect.objectContaining({ fromBatchName: "Tue 5pm", toBatchName: "Thu 6pm" }),
      }),
    );
  });

  it("refuses a move into the batch they are already in", async () => {
    await expect(
      transferStudentBatch({ studentId: STUDENT, toBatchId: OLD_BATCH, actor: { id: ACTOR } }),
    ).rejects.toThrow("already in that batch");
    expect(mocks.batchUpdateOne).not.toHaveBeenCalled();
  });

  it("refuses to guess when the student sits in more than one batch", async () => {
    mocks.userFindOne.mockReturnValue(
      lean({ _id: STUDENT, name: "Riya", batches: [OLD_BATCH, "bbbbbbbbbbbbbbbbbbbbbb03"], isActive: true }),
    );
    await expect(run()).rejects.toThrow("more than one batch");
    expect(mocks.batchUpdateOne).not.toHaveBeenCalled();
  });

  it("refuses to move a deactivated student", async () => {
    mocks.userFindOne.mockReturnValue(lean({ _id: STUDENT, name: "Riya", batches: [OLD_BATCH], isActive: false }));
    await expect(run()).rejects.toThrow("deactivated");
    expect(mocks.batchUpdateOne).not.toHaveBeenCalled();
  });
});

describe("transferStudentBatch notifications", () => {
  it("tells the outgoing coach the student left, without naming where they went", async () => {
    withClassrooms([], []);
    await run();

    expect(mocks.notifyLeft).toHaveBeenCalledTimes(1);
    const [departure] = mocks.notifyLeft.mock.calls[0];
    expect(departure).toMatchObject({ batchId: OLD_BATCH, studentIds: [STUDENT], reason: "batch_changed" });
    // The destination is the academy's business, not the outgoing coach's.
    expect(JSON.stringify(departure)).not.toContain(NEW_BATCH);
    expect(JSON.stringify(departure)).not.toContain("Thu 6pm");
  });

  it("tells the family about the new batch and the receiving coach about the arrival", async () => {
    withClassrooms([], []);
    await run();

    expect(mocks.notifyChanged).toHaveBeenCalledWith({ studentId: STUDENT, toBatchId: NEW_BATCH, fromBatchId: OLD_BATCH });
    expect(mocks.notifyJoined).toHaveBeenCalledTimes(1);
    expect(mocks.notifyJoined).toHaveBeenCalledWith({ batchId: NEW_BATCH, studentIds: [STUDENT], reason: "batch_changed" });
  });

  it("still completes the move when an announcement fails", async () => {
    withClassrooms([], []);
    mocks.notifyChanged.mockRejectedValue(new Error("webhook down"));

    await expect(run()).resolves.toMatchObject({ toBatchName: "Thu 6pm" });
    expect(mocks.activity).toHaveBeenCalled();
  });
});
