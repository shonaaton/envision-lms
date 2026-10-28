import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), permission: vi.fn(), exists: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/featureAccess", () => ({ canAccessFeature: mocks.permission }));
vi.mock("@/models/WhatsAppConversation", () => ({ WhatsAppConversation: { exists: mocks.exists } }));
import { canAccessWhatsAppPhone, whatsappConversationScope, whatsappSession } from "./whatsappAccess";
beforeEach(() => { vi.resetAllMocks(); mocks.permission.mockResolvedValue(true); });
describe("WhatsApp staff and assigned-coach access", () => {
  it("restricts coaches to the phone numbers assigned to their own account", async () => {
    const user = { id: "coach-a", role: "instructor" };
    expect(whatsappConversationScope(user)).toEqual({ assignedTo: "coach-a" });
    mocks.exists.mockResolvedValue(null); expect(await canAccessWhatsAppPhone(user, "919999999999")).toBe(false);
    expect(mocks.exists).toHaveBeenCalledWith({ phoneNumber: "919999999999", assignedTo: "coach-a" });
    mocks.exists.mockResolvedValue({ _id: "assigned" }); expect(await canAccessWhatsAppPhone(user, "919999999999")).toBe(true);
  });
  it("lets authorised administrators see the shared inbox", async () => {
    expect(whatsappConversationScope({ id: "admin", role: "admin" })).toEqual({});
    expect(await canAccessWhatsAppPhone({ id: "admin", role: "admin" }, "919999999999")).toBe(true);
    expect(mocks.exists).not.toHaveBeenCalled();
  });
  it.each([{ role: "student" }, { role: "admin", isActive: false }, { role: "admin", branch: "offline-branch" }, { role: "instructor", isPaused: true }])("rejects a disallowed account %j", async (user) => {
    mocks.auth.mockResolvedValue({ user: { id: "someone", ...user } }); expect(await whatsappSession()).toBeNull();
  });
  it("checks the requested feature permission rather than trusting the role name", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "staff", role: "sub-admin" } }); mocks.permission.mockResolvedValue(false);
    expect(await whatsappSession("manage")).toBeNull(); expect(mocks.permission).toHaveBeenCalledWith("whatsapp", expect.objectContaining({ id: "staff" }), "manage");
  });
});
