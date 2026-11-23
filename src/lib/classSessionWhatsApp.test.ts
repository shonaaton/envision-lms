import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  active: vi.fn(), whatsapp: vi.fn(), batch: vi.fn(), email: vi.fn(),
}));
vi.mock("@/lib/whatsappAutomationEvents", () => ({
  sendWhatsAppAutomationTemplate: mocks.whatsapp,
  sendWhatsAppAutomationTemplates: mocks.batch,
  whatsappRecipientName: () => "Student",
}));
vi.mock("@/lib/emailAutomation", () => ({ sendAutomationEmail: mocks.email }));
vi.mock("@/models/LoginSession", () => ({ LoginSession: { exists: mocks.active } }));
vi.mock("@/models/User", () => ({ User: {
  find: () => ({ select: () => ({ lean: async () => [{ _id: "student", name: "Student", email: "student@example.com" }] }) }),
  findById: () => ({ select: () => ({ lean: async () => ({ _id: "coach", name: "Coach", email: "coach@example.com" }) }) }),
} }));
import { dueStartReminderOffset, sendStartingSoonReminder } from "./classSessionNotifications";
const classroom = { _id: "classroom", students: ["student"], coach: "coach" };
const session = { _id: "session" };
describe("class WhatsApp reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.email.mockResolvedValue({});
    mocks.whatsapp.mockResolvedValue({});
    mocks.batch.mockResolvedValue({});
    mocks.active.mockResolvedValue(null);
  });
  it("uses 60/10 for students, including late-added classes", () => {
    expect([61, 60, 31, 30, 11, 10, 1, 0].map(n => dueStartReminderOffset(n, [60, 10])))
      .toEqual([null, 60, 60, 60, 60, 10, 10, null]);
  });
  it("sends student WhatsApp at 60 without changing email or coach sends", async () => {
    await sendStartingSoonReminder(classroom, session, new Date(), 60, true);
    expect(mocks.batch.mock.calls[0][0][0].bodyParameters[2]).toBe("60");
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.whatsapp).not.toHaveBeenCalled();
  });
  it("suppresses the early coach WhatsApp for a valid database login", async () => {
    mocks.active.mockResolvedValue({ _id: "login" });
    await sendStartingSoonReminder(classroom, session, new Date(), 30);
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.email).toHaveBeenCalledTimes(2);
    expect(mocks.active).toHaveBeenCalledWith({
      user: "coach", revokedAt: null, expiresAt: { $gt: expect.any(Date) },
    });
  });
  it("keeps the early coach WhatsApp when no valid login exists", async () => {
    await sendStartingSoonReminder(classroom, session, new Date(), 30);
    expect(mocks.whatsapp).toHaveBeenCalledTimes(1);
  });
  it("always sends the 10-minute coach WhatsApp without querying login", async () => {
    mocks.active.mockResolvedValue({ _id: "login" });
    await sendStartingSoonReminder(classroom, session, new Date(), 10);
    expect(mocks.whatsapp).toHaveBeenCalledTimes(1);
    expect(mocks.active).not.toHaveBeenCalled();
  });
});
