import { describe, expect, it, vi, beforeEach } from "vitest";
import { examTimeExtension } from "./examTimeExtensions";
import { notifyExamTimeExtended } from "./examNotifications";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";

vi.mock("@/lib/emailAutomation", () => ({sendAutomationEmail: vi.fn()}));
vi.mock("@/models/Fee", () => ({Notification: {updateOne: vi.fn()}}));
vi.mock("@/lib/whatsappAutomationEvents", () => ({sendWhatsAppAutomationTemplate: vi.fn(), whatsappRecipientName: (s: any) => s.name}));

const now = new Date("2026-11-05T08:00:00Z");
const deadline = "2026-11-05T09:00:00Z";
const later = "2026-11-06T09:00:00Z";
const check = (status: string, kind: string, newDeadline = later, endsAt = deadline) => examTimeExtension({
  kind, now, newDeadline, assignment: {status, availableUntil: deadline, endsAt},
});

describe("extending an individual exam", () => {
  it("extends the start window and a live sitting independently", () => {
    expect(check("expired", "window").newDeadline.toISOString()).toBe(new Date(later).toISOString());
    expect(check("in_progress", "sitting").kind).toBe("sitting");
    expect(() => check("in_progress", "window")).toThrow();
    expect(() => check("assigned", "sitting")).toThrow();
  });
  it("refuses finished attempts, expired timers and shortening the deadline", () => {
    for (const status of ["submitted", "cancelled"]) expect(() => check(status, "window")).toThrow();
    expect(() => check("in_progress", "sitting", later, now.toISOString())).toThrow();
    expect(() => check("assigned", "window", deadline)).toThrow();
  });
});

describe("extension notifications", () => {
  beforeEach(() => vi.clearAllMocks());
  it("emails a shared mailbox once and retries only WhatsApp if Meta is unavailable", async () => {
    const student = { _id: "student", name: "Aarav", email: "family@example.com", parentEmail: "Family@example.com", phone: "1234567890" };
    const exam = { _id: "exam", tier: "beginner", levelNumber: 2, student };
    const event = {requestId: "ext", kind: "sitting", previousDeadline: deadline, newDeadline: later };
    vi.mocked(sendAutomationEmail).mockResolvedValue({delivered: true} as any);
    vi.mocked(sendWhatsAppAutomationTemplate).mockResolvedValueOnce({delivered: false} as any).mockResolvedValueOnce({delivered: true} as any);
    const first = await notifyExamTimeExtended(exam, event);
    expect(first.status).toBe("pending");
    const second = await notifyExamTimeExtended(exam, {...event, notification: first});
    expect(second.status).toBe("sent");
    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(sendWhatsAppAutomationTemplate).mock.calls[1][0];
    const rendered = renderWhatsAppTemplatePreview(payload.templateName, payload.bodyParameters || []);
    expect(rendered).toContain("Updated finish time: 6 Nov 2026");
    expect(rendered).not.toContain("{{");
    expect(rendered).toContain("IST");
  });
});
