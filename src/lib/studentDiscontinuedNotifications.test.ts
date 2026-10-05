import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  batchFind: vi.fn(),
  classroomFind: vi.fn(),
  userFindById: vi.fn(),
  userFind: vi.fn(),
  notificationCreate: vi.fn(),
  sendEmail: vi.fn(),
  sendWhatsApp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/models/Batch", () => ({ Batch: { find: mocks.batchFind } }));
vi.mock("@/models/Classroom", () => ({ Classroom: { find: mocks.classroomFind } }));
vi.mock("@/models/User", () => ({ User: { findById: mocks.userFindById, find: mocks.userFind } }));
vi.mock("@/models/Fee", () => ({ Notification: { create: mocks.notificationCreate } }));
vi.mock("@/lib/emailAutomation", () => ({ sendAutomationEmail: mocks.sendEmail }));
vi.mock("@/lib/whatsappAutomationEvents", () => ({
  sendWhatsAppAutomationTemplate: mocks.sendWhatsApp,
  whatsappRecipientName: (user: any, fallback = "there") => String(user?.name || user?.username || fallback),
}));

import { notifyCoachesStudentDiscontinued, studentCoachGroups } from "./studentDiscontinuedNotifications";

const STUDENT = "aaaaaaaaaaaaaaaaaaaaaaa1";
const BATCH_COACH = "cccccccccccccccccccccc01";
const PRIVATE_COACH = "cccccccccccccccccccccc02";
const BATCH = "bbbbbbbbbbbbbbbbbbbbbb01";

/** `.select(...).lean()` off a mongoose query. */
const chain = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

const coaches = [
  { _id: BATCH_COACH, name: "Coach Sanjib", email: "sanjib@example.com", phone: "9000000001" },
  { _id: PRIVATE_COACH, name: "Coach Ritu", email: "ritu@example.com", phone: "9000000002" },
];
const delivered = { ok: true, delivered: true, skipped: false };
const notApproved = { ok: false, delivered: false, skipped: false, payload: { error: { code: 132001 } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.batchFind.mockImplementation(() => chain([{ _id: BATCH, name: "I2-100", coach: BATCH_COACH }]));
  mocks.classroomFind.mockImplementation(() => chain([
    // The batch's own classroom - named by the batch, not listed twice.
    { _id: "c1", title: "Intermediate Chess I2", coach: BATCH_COACH, batches: [BATCH] },
    // A one-to-one class with another coach.
    { _id: "c2", title: "Aarav 1:1", coach: PRIVATE_COACH, batches: [] },
    // A class the student already left - its coach is not told again.
    { _id: "c3", title: "Old Group", coach: "cccccccccccccccccccccc09", batches: [], studentExits: [{ student: STUDENT, exitedAt: new Date("2026-01-01") }] },
  ]));
  mocks.userFindById.mockImplementation(() => chain({ _id: STUDENT, name: "Aarav Sharma", role: "student" }));
  mocks.userFind.mockImplementation(() => chain(coaches));
  mocks.notificationCreate.mockResolvedValue({});
  mocks.sendEmail.mockResolvedValue({});
  mocks.sendWhatsApp.mockResolvedValue(delivered);
});

describe("student discontinued", () => {
  it("finds each coach still teaching the student, with what they teach them", async () => {
    const groups = await studentCoachGroups(STUDENT);
    expect(Object.fromEntries(groups)).toEqual({ [BATCH_COACH]: ["I2-100"], [PRIVATE_COACH]: ["Aarav 1:1"] });
  });

  it("tells every coach in-app, by email and on WhatsApp", async () => {
    const groups = await studentCoachGroups(STUDENT);
    await notifyCoachesStudentDiscontinued({ studentId: STUDENT, groups, effectiveFrom: new Date("2026-10-05T06:00:00Z") });

    expect(mocks.notificationCreate.mock.calls.map(([call]) => call.user).sort()).toEqual([BATCH_COACH, PRIVATE_COACH]);
    expect(mocks.sendEmail.mock.calls.map(([call]) => call.to).sort()).toEqual(["ritu@example.com", "sanjib@example.com"]);
    const sanjibEmail = mocks.sendEmail.mock.calls.map(([call]) => call).find((call) => call.to === "sanjib@example.com");
    expect(sanjibEmail.subject).toBe("Aarav Sharma has discontinued: I2-100");
    expect(sanjibEmail.message).toMatch(/Aarav Sharma has discontinued classes at Envision Chess Academy with effect from 5 Oct 2026/);

    const whatsApp = mocks.sendWhatsApp.mock.calls.map(([call]) => call);
    expect(whatsApp.map((call) => call.templateName)).toEqual(["student_discontinued_coach", "student_discontinued_coach"]);
    expect(whatsApp.find((call) => call.user._id === BATCH_COACH).bodyParameters).toEqual(["Coach Sanjib", "Aarav Sharma", "5 Oct 2026", "I2-100"]);
  });

  it("falls back to the approved 'has left' template until Meta approves the new one", async () => {
    mocks.sendWhatsApp.mockImplementation(async (call: any) => (call.templateName === "student_discontinued_coach" ? notApproved : delivered));
    await notifyCoachesStudentDiscontinued({
      studentId: STUDENT,
      groups: new Map([[BATCH_COACH, ["I2-100"]]]),
      effectiveFrom: new Date("2026-10-05T06:00:00Z"),
    });
    const fallback = mocks.sendWhatsApp.mock.calls.map(([call]) => call).find((call) => call.templateName === "batch_student_left_coach");
    expect(fallback.bodyParameters).toEqual(["Coach Sanjib", "Aarav Sharma", "I2-100", "5 Oct 2026"]);
  });

  it("sends nothing when the student was in no running class", async () => {
    await notifyCoachesStudentDiscontinued({ studentId: STUDENT, groups: new Map() });
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
