import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  batchFindById: vi.fn(),
  classroomFind: vi.fn(),
  userFind: vi.fn(),
  userFindOne: vi.fn(),
  notificationCreate: vi.fn(),
  notificationFindOne: vi.fn(),
  sendEmail: vi.fn(),
  sendWhatsApp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/models/Batch", () => ({ Batch: { findById: mocks.batchFindById } }));
vi.mock("@/models/Classroom", () => ({ Classroom: { find: mocks.classroomFind } }));
vi.mock("@/models/User", () => ({ User: { find: mocks.userFind, findOne: mocks.userFindOne } }));
vi.mock("@/models/Fee", () => ({
  Notification: { create: mocks.notificationCreate, findOne: mocks.notificationFindOne },
}));
vi.mock("@/lib/emailAutomation", () => ({ sendAutomationEmail: mocks.sendEmail }));
vi.mock("@/lib/whatsappAutomationEvents", () => ({
  sendWhatsAppAutomationTemplate: mocks.sendWhatsApp,
  whatsappRecipientName: (user: any, fallback = "there") => String(user?.name || user?.username || fallback),
}));

import {
  notifyStudentBatchChanged,
  notifyStudentsJoinedBatchCoach,
  notifyStudentsLeftBatchCoach,
} from "./batchMembershipNotifications";

const OLD_BATCH = "bbbbbbbbbbbbbbbbbbbbbb01";
const NEW_BATCH = "bbbbbbbbbbbbbbbbbbbbbb02";
const STUDENT = "aaaaaaaaaaaaaaaaaaaaaaa1";
const OLD_COACH = "cccccccccccccccccccccc01";
const NEW_COACH = "cccccccccccccccccccccc02";

/** `.select(...).lean()` off a mongoose query. */
const chain = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

const saturdayClass = {
  _id: "class1",
  title: "Intermediate Chess I2",
  courseName: "Intermediate Chess",
  levelName: "I2",
  daysOfWeek: [{ day: 6, slots: [{ startTime: "18:00", durationMinutes: 60 }] }],
  generatedSessions: [{ _id: "s1", scheduledFor: new Date("2030-01-05T12:30:00.000Z") }],
};

const coaches: Record<string, any> = {
  [OLD_COACH]: { _id: OLD_COACH, name: "Coach Sanjib", email: "sanjib@example.com", phone: "9000000001" },
  [NEW_COACH]: { _id: NEW_COACH, name: "Coach Ritu", email: "ritu@example.com", phone: "9000000002" },
};

const student = {
  _id: STUDENT,
  name: "Aarav Sharma",
  email: "aarav@example.com",
  parentName: "Mr. Sharma",
  parentEmail: "sharma@example.com",
  phone: "9111111111",
  isActive: true,
};

const batches: Record<string, any> = {
  [OLD_BATCH]: { _id: OLD_BATCH, name: "I2-100", coach: OLD_COACH, studentEnrollments: [] },
  [NEW_BATCH]: {
    _id: NEW_BATCH,
    name: "I2-204",
    coach: NEW_COACH,
    studentEnrollments: [{ student: STUDENT, enrolledAt: new Date("2029-12-01T00:00:00.000Z") }],
  },
};

/** Every string that actually left the building, across both channels. */
function sentText() {
  return JSON.stringify([mocks.sendEmail.mock.calls, mocks.sendWhatsApp.mock.calls, mocks.notificationCreate.mock.calls]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.batchFindById.mockImplementation((id: string) => chain(batches[id] || null));
  mocks.classroomFind.mockImplementation(() => chain([saturdayClass]));
  mocks.userFindOne.mockImplementation((query: any) => chain(coaches[String(query._id)] || null));
  mocks.userFind.mockImplementation(() => chain([student]));
  mocks.notificationFindOne.mockImplementation(() => chain(null));
  mocks.notificationCreate.mockResolvedValue({ _id: "n1" });
  mocks.sendEmail.mockResolvedValue({ ok: true });
  mocks.sendWhatsApp.mockResolvedValue({ ok: true, delivered: true });
});

describe("notifyStudentsLeftBatchCoach", () => {
  it("tells the coach the student left their batch", async () => {
    const result = await notifyStudentsLeftBatchCoach({
      batchId: OLD_BATCH,
      studentIds: [STUDENT],
      reason: "batch_changed",
      effectiveFrom: new Date("2029-12-20T06:00:00.000Z"),
    });

    expect(result).toMatchObject({ sent: 1 });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sanjib@example.com" }));
    expect(mocks.sendEmail.mock.calls[0][0].message).toContain("Aarav Sharma has left I2-100");
    expect(mocks.sendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "batch_student_left_coach",
        bodyParameters: ["Coach Sanjib", "Aarav Sharma", "I2-100", "20 Dec 2029"],
      }),
    );
  });

  it("never names where the student went", async () => {
    await notifyStudentsLeftBatchCoach({ batchId: OLD_BATCH, studentIds: [STUDENT], reason: "batch_changed" });

    const text = sentText();
    expect(text).not.toContain("I2-204");
    expect(text).not.toContain("Coach Ritu");
    expect(text).not.toContain(NEW_BATCH);
    // Nothing goes to the receiving coach either.
    expect(mocks.sendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ to: "ritu@example.com" }));
  });

  it("says nothing when the batch has no coach", async () => {
    mocks.batchFindById.mockImplementation(() => chain({ _id: OLD_BATCH, name: "I2-100", studentEnrollments: [] }));
    const result = await notifyStudentsLeftBatchCoach({ batchId: OLD_BATCH, studentIds: [STUDENT], reason: "batch_changed" });
    expect(result).toMatchObject({ sent: 0, reason: "no_coach" });
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });
});

describe("notifyStudentsJoinedBatchCoach", () => {
  it("tells the receiving coach who joined, and when the batch next meets", async () => {
    const result = await notifyStudentsJoinedBatchCoach({ batchId: NEW_BATCH, studentIds: [STUDENT], reason: "batch_changed" });

    expect(result).toMatchObject({ sent: 1 });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ritu@example.com" }));
    const [payload] = mocks.sendWhatsApp.mock.calls[0];
    expect(payload.templateName).toBe("batch_student_joined_coach");
    expect(payload.bodyParameters.slice(0, 5)).toEqual([
      "Coach Ritu",
      "Aarav Sharma",
      "I2-204",
      "Intermediate Chess",
      "I2",
    ]);
    expect(payload.bodyParameters[5]).toContain("Saturday at 18:00");
    expect(payload.bodyParameters[6]).toContain("2030");
  });

  it("stays quiet on a second run for the same arrival", async () => {
    // The in-app notice written by the first run is the ledger the second reads.
    mocks.notificationFindOne.mockImplementation(() => chain({ _id: "already-told" }));

    const result = await notifyStudentsJoinedBatchCoach({ batchId: NEW_BATCH, studentIds: [STUDENT], reason: "new_admission" });

    expect(result).toMatchObject({ sent: 0 });
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("only counts a notice raised since this spell in the batch began", async () => {
    await notifyStudentsJoinedBatchCoach({ batchId: NEW_BATCH, studentIds: [STUDENT], reason: "new_admission" });
    expect(mocks.notificationFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "batch_student_joined",
        "metadata.batchId": NEW_BATCH,
        "metadata.studentId": STUDENT,
        createdAt: { $gte: new Date("2029-12-01T00:00:00.000Z") },
      }),
    );
  });

  it("skips a deactivated student", async () => {
    mocks.userFind.mockImplementation(() => chain([{ ...student, isActive: false }]));
    const result = await notifyStudentsJoinedBatchCoach({ batchId: NEW_BATCH, studentIds: [STUDENT], reason: "new_admission" });
    expect(result).toMatchObject({ sent: 0 });
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });
});

describe("notifyStudentBatchChanged", () => {
  it("gives the family the new batch, coach, timings and next class date", async () => {
    const result = await notifyStudentBatchChanged({ studentId: STUDENT, toBatchId: NEW_BATCH, fromBatchId: OLD_BATCH });

    expect(result).toMatchObject({ sent: 1 });
    const [payload] = mocks.sendWhatsApp.mock.calls[0];
    expect(payload.templateName).toBe("batch_changed_student");
    expect(payload.bodyParameters.slice(0, 4)).toEqual(["Mr. Sharma", "Aarav Sharma", "I2-204", "Coach Ritu"]);
    expect(payload.bodyParameters[4]).toContain("Saturday at 18:00");
    expect(payload.bodyParameters[5]).toContain("2030");

    const message = mocks.sendEmail.mock.calls[0][0].message;
    expect(message).toContain("Hello Mr. Sharma");
    expect(message).toContain("batch has been changed to I2-204");
    expect(message).toContain("Coach: Coach Ritu");
  });

  it("writes to both addresses when the family really keeps two", async () => {
    await notifyStudentBatchChanged({ studentId: STUDENT, toBatchId: NEW_BATCH });
    expect(mocks.sendEmail.mock.calls.map((call) => call[0].to).sort()).toEqual([
      "aarav@example.com",
      "sharma@example.com",
    ]);
  });

  it("sends one copy when the student and parent share an inbox", async () => {
    mocks.userFind.mockImplementation(() => chain([{ ...student, parentEmail: "aarav@example.com" }]));
    await notifyStudentBatchChanged({ studentId: STUDENT, toBatchId: NEW_BATCH });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].metadata.recipientType).toBe("parent");
  });
});
