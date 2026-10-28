import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), manage: vi.fn(), find: vi.fn(), rows: vi.fn(), summaries: vi.fn(), reads: vi.fn(), count: vi.fn(), updateRead: vi.fn(), updateSummary: vi.fn(), exists: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/featureAccess", () => ({ canAccessFeature: mocks.manage }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/whatsappInbox", async (original) => ({ ...await original<any>(), syncWhatsAppConversations: mocks.sync }));
vi.mock("@/models/WhatsApp", () => ({ WhatsAppMessage: { find: mocks.find, countDocuments: mocks.count, exists: mocks.exists } }));
vi.mock("@/models/WhatsAppConversation", () => ({
  WhatsAppConversation: { find: () => ({ populate: () => ({ sort: () => ({ lean: mocks.summaries }) }) }), updateOne: mocks.updateSummary },
  WhatsAppReadState: { init: vi.fn(), find: () => ({ lean: mocks.reads }), updateOne: mocks.updateRead },
  WhatsAppInboxSync: {},
}));
import { GET, PATCH } from "./route";
const phone = "919999999999";
const id = new Types.ObjectId();
const patch = (body: unknown) => new Request("http://localhost/api/admin/whatsapp", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "staff-1", role: "admin" } });
  mocks.manage.mockResolvedValue(true);
  mocks.rows.mockResolvedValue([]); mocks.summaries.mockResolvedValue([]); mocks.reads.mockResolvedValue([]);
  mocks.find.mockImplementation(() => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: mocks.rows }) }) }) }));
});
describe("WhatsApp inbox history and triage", () => {
  it("pages tied timestamps with an id cursor and escapes search input", async () => {
    const before = `1780000000000_${id}`;
    await GET(new Request(`http://localhost/api/admin/whatsapp?view=thread&phone=${phone}&before=${before}&q=${encodeURIComponent("a.*[b]")}`));
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: phone, text: { $regex: "a\\.\\*\\[b\\]", $options: "i" }, $or: expect.arrayContaining([{ createdAt: new Date(1780000000000), _id: { $lt: id } }]) }));
  });
  it("returns a next cursor without leaking the extra history row", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ _id: new Types.ObjectId(), createdAt: new Date(1780000000000 - i * 1000), direction: "inbound", text: `Message ${i}`, messageType: "text" }));
    mocks.rows.mockResolvedValue(rows);
    const payload = await (await GET(new Request(`http://localhost/api/admin/whatsapp?view=thread&phone=${phone}`))).json();
    expect(payload.messages).toHaveLength(50); expect(payload.hasMore).toBe(true);
    expect(payload.nextCursor).toBe(`${new Date(rows[49].createdAt).getTime()}_${rows[49]._id}`);
    expect(payload.messages[0].text).toBe("Message 49");
  });
  it("uses complete summaries for unread, needs reply and reopening on new inbound messages", async () => {
    const laterId = new Types.ObjectId();
    mocks.summaries.mockResolvedValue([{ phoneNumber: phone, contactName: "A parent", latest: { text: "Please help" }, lastInboundId: laterId, resolvedThroughInboundId: id, resolvedAt: new Date(), lastInboundAt: new Date(), lastInboundCreatedAt: new Date(), lastBusinessMessageAt: new Date(Date.now() - 1000), inboundCount: 10, sentTemplateCount: 2 }]);
    mocks.reads.mockResolvedValue([{ phoneNumber: phone, readInboundCount: 7 }]);
    const payload = await (await GET(new Request("http://localhost/api/admin/whatsapp"))).json();
    expect(payload.conversations[0]).toMatchObject({ unreadCount: 3, resolved: false, needsReply: true, canReply: true, lastMessageText: "Please help" });
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("marks only the displayed inbound watermark read for the authenticated staff member", async () => {
    mocks.exists.mockResolvedValue({ _id: id }); mocks.count.mockResolvedValue(7);
    expect((await PATCH(patch({ phoneNumber: phone, action: "read", lastInboundId: String(id) }))).status).toBe(200);
    expect(mocks.updateRead).toHaveBeenCalledWith({ actorId: "staff-1", phoneNumber: phone }, { $max: { readInboundCount: 7, readThroughInboundId: id } }, { upsert: true });
  });
  it("rejects foreign read watermarks and invalid history cursors", async () => {
    mocks.exists.mockResolvedValue(null);
    expect((await PATCH(patch({ phoneNumber: phone, action: "read", lastInboundId: String(id) }))).status).toBe(404);
    expect((await GET(new Request(`http://localhost/api/admin/whatsapp?view=thread&phone=${phone}&before=bad`))).status).toBe(400);
    expect(mocks.updateRead).not.toHaveBeenCalled();
  });
  it("does not let a view-only role resolve a shared conversation", async () => {
    mocks.manage.mockImplementation(async (_feature, _user, permission) => permission === "view");
    expect((await PATCH(patch({ phoneNumber: phone, action: "resolve", lastInboundId: String(id) }))).status).toBe(403);
    expect(mocks.updateSummary).not.toHaveBeenCalled();
  });
});
