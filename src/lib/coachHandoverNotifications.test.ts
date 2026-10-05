import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindById: vi.fn(),
  userFind: vi.fn(),
  notificationCreate: vi.fn(),
  sendEmail: vi.fn(),
  sendWhatsApp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/models/User", () => ({ User: { findById: mocks.userFindById, find: mocks.userFind } }));
vi.mock("@/models/Fee", () => ({ Notification: { create: mocks.notificationCreate } }));
vi.mock("@/lib/emailAutomation", () => ({ sendAutomationEmail: mocks.sendEmail }));
vi.mock("@/lib/whatsappAutomationEvents", () => ({
  sendWhatsAppAutomationTemplate: mocks.sendWhatsApp,
  whatsappRecipientName: (user: any, fallback = "there") => String(user?.name || user?.username || fallback),
}));

import { notifyCoachHandover } from "./coachHandoverNotifications";

const OLD_COACH = "cccccccccccccccccccccc01";
const NEW_COACH = "cccccccccccccccccccccc02";
const STUDENT = "aaaaaaaaaaaaaaaaaaaaaaa1";

/** `.select(...).lean()` off a mongoose query. */
const chain = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

const users: Record<string, any> = {
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

const delivered = { ok: true, delivered: true, skipped: false };
const notApproved = { ok: false, delivered: false, skipped: false, payload: { error: { code: 132001 } }, errorMessage: "Template name does not exist in the translation" };

const handover = (overrides: Record<string, unknown> = {}) => notifyCoachHandover({
  scope: "classroom",
  scopeId: "class1",
  label: "I2-100",
  previousCoachId: OLD_COACH,
  newCoachId: NEW_COACH,
  studentIds: [STUDENT],
  effectiveFrom: new Date("2030-01-05T12:30:00.000Z"),
  course: "Intermediate Chess",
  level: "I2",
  timings: "Saturday at 18:00 (60 min)",
  nextTopic: "Knight Forks",
  studentsLabel: "Aarav Sharma (1 total)",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindById.mockImplementation((id: string) => chain(users[id] || null));
  mocks.userFind.mockImplementation(() => chain([student]));
  mocks.notificationCreate.mockResolvedValue({});
  mocks.sendEmail.mockResolvedValue({});
  mocks.sendWhatsApp.mockResolvedValue(delivered);
});

describe("permanent coach handover", () => {
  it("messages the previous coach, then the new coach, then the family - on WhatsApp", async () => {
    await handover();
    expect(mocks.sendWhatsApp.mock.calls.map(([call]) => call.templateName)).toEqual([
      "coach_handover_previous_coach",
      "coach_handover_new_coach",
      "coach_handover_student",
    ]);
    const [previous, next, family] = mocks.sendWhatsApp.mock.calls.map(([call]) => call);
    expect(previous.user._id).toBe(OLD_COACH);
    expect(previous.bodyParameters).toEqual(["Coach Sanjib", "I2-100", "Saturday, 5 January", "Coach Ritu"]);
    expect(next.user._id).toBe(NEW_COACH);
    expect(next.bodyParameters).toContain("Coach Sanjib");
    expect(next.bodyParameters).toContain("Knight Forks");
    expect(family.user._id).toBe(STUDENT);
    expect(family.bodyParameters.slice(0, 4)).toEqual(["Mr. Sharma", "I2-100", "Saturday, 5 January", "Coach Ritu"]);
  });

  it("reassures the family by email too, once per inbox", async () => {
    await handover();
    const familyEmails = mocks.sendEmail.mock.calls.map(([call]) => call).filter((call) => call.metadata?.studentId === STUDENT);
    expect(familyEmails.map((call) => call.to).sort()).toEqual(["aarav@example.com", "sharma@example.com"]);
    expect(familyEmails[0].message).toMatch(/syllabus and progress carry over/);
    expect(familyEmails[0].message).toMatch(/quality of teaching stays the best/);
  });

  it("tells the previous coach in-app and by email as well", async () => {
    await handover();
    expect(mocks.notificationCreate).toHaveBeenCalledWith(expect.objectContaining({ user: OLD_COACH, type: "class_coach_released" }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sanjib@example.com" }));
  });

  it("falls back to the approved templates while Meta has not approved the new ones", async () => {
    mocks.sendWhatsApp.mockImplementation(async (call: any) => (call.templateName.startsWith("coach_handover_") ? notApproved : delivered));
    const newCoachFallback = vi.fn().mockResolvedValue(delivered);
    await handover({ newCoachFallback });
    expect(newCoachFallback).toHaveBeenCalledTimes(1);
    const familyFallback = mocks.sendWhatsApp.mock.calls.map(([call]) => call).find((call) => call.templateName === "batch_permanent_coach_changed_student");
    expect(familyFallback?.user._id).toBe(STUDENT);
    expect(familyFallback?.bodyParameters).toEqual(["Aarav Sharma", "I2-100", "Coach Ritu", "Intermediate Chess", "I2", "Saturday at 18:00 (60 min)"]);
  });

  it("does not fall back when the new template simply could not reach a phone", async () => {
    mocks.sendWhatsApp.mockResolvedValue({ ok: false, delivered: false, skipped: true });
    const newCoachFallback = vi.fn();
    await handover({ newCoachFallback });
    expect(newCoachFallback).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp.mock.calls.some(([call]) => call.templateName === "batch_permanent_coach_changed_student")).toBe(false);
  });

  it("skips the previous-coach message when there was no previous coach", async () => {
    await handover({ previousCoachId: "" });
    expect(mocks.sendWhatsApp.mock.calls.map(([call]) => call.templateName)).toEqual(["coach_handover_new_coach", "coach_handover_student"]);
  });
});
